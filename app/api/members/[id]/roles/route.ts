export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";
import { ensureDefaultRoleFunctions } from "@/lib/role-functions";
import { MEMBER_FUNCTION_OPTIONS } from "@/lib/member-profile";

/**
 * GET /api/members/[id]/roles
 * Retorna roles aprovados e pendentes do membro
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const sessionUser = session.user as SessionUser;

    // Membro pode ver os próprios roles; líder pode ver de qualquer membro do grupo
    const isOwnProfile = sessionUser.id === params.id;
    if (!isOwnProfile) {
      const requester = await prisma.user.findUnique({
        where: { id: sessionUser.id },
        include: { profile: true },
      });
      if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      }
    }

    const functions = await prisma.memberFunction.findMany({
      where: { memberId: params.id },
      include: { roleFunction: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const toValue = (name: string) =>
      MEMBER_FUNCTION_OPTIONS.find((o) => o.label === name)?.value ?? name;

    const approved = functions
      .filter((f) => !f.isPending)
      .map((f) => toValue(f.roleFunction.name));

    const pending = functions
      .filter((f) => f.isPending)
      .map((f) => toValue(f.roleFunction.name));

    return NextResponse.json({ approved, pending });
  } catch (error) {
    console.error("GET member roles error:", error);
    return NextResponse.json({ error: "Erro ao buscar roles" }, { status: 500 });
  }
}

/**
 * POST /api/members/[id]/roles
 * Membro sugere seus próprios roles (ficam como isPending=true)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const sessionUser = session.user as SessionUser;

    // Só o próprio membro pode sugerir
    if (sessionUser.id !== params.id) {
      return NextResponse.json({ error: "Você só pode sugerir seus próprios roles" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: params.id } });
    if (!targetUser?.groupId) {
      return NextResponse.json({ error: "Membro sem grupo" }, { status: 400 });
    }

    const body = await req.json();
    const { roles } = body ?? {};

    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: "roles deve ser um array" }, { status: 400 });
    }

    const roleFunctionMap = await ensureDefaultRoleFunctions(targetUser.groupId);

    // Remove sugestões pendentes anteriores deste membro
    await prisma.memberFunction.deleteMany({
      where: { memberId: params.id, isPending: true },
    });

    // Cria novas sugestões pendentes (apenas para os que ainda não são aprovados)
    const approved = await prisma.memberFunction.findMany({
      where: { memberId: params.id, isPending: false },
      select: { roleFunctionId: true },
    });
    const approvedIds = new Set(approved.map((a) => a.roleFunctionId));

    for (const roleValue of roles) {
      const roleFunctionId = roleFunctionMap[roleValue as keyof typeof roleFunctionMap];
      if (!roleFunctionId || approvedIds.has(roleFunctionId)) continue;

      await prisma.memberFunction.create({
        data: {
          memberId: params.id,
          roleFunctionId,
          isPending: true,
          suggestedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, message: "Sugestão enviada. Aguardando aprovação do líder." });
  } catch (error) {
    console.error("POST member roles error:", error);
    return NextResponse.json({ error: "Erro ao sugerir roles" }, { status: 500 });
  }
}

/**
 * PATCH /api/members/[id]/roles
 * Líder aprova ou rejeita sugestões pendentes
 * Body: { action: "approve" | "reject", roles: string[] }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const sessionUser = session.user as SessionUser;
    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { action, roles } = body ?? {};

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action deve ser 'approve' ou 'reject'" }, { status: 400 });
    }

    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: "roles deve ser um array" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: params.id } });
    if (!targetUser?.groupId) {
      return NextResponse.json({ error: "Membro sem grupo" }, { status: 400 });
    }

    if (requester.role !== "SUPERADMIN" && targetUser.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const roleFunctionMap = await ensureDefaultRoleFunctions(targetUser.groupId);

    const roleFunctionIds = roles
      .map((v: string) => roleFunctionMap[v as keyof typeof roleFunctionMap])
      .filter(Boolean);

    if (action === "approve") {
      await prisma.memberFunction.updateMany({
        where: {
          memberId: params.id,
          roleFunctionId: { in: roleFunctionIds },
          isPending: true,
        },
        data: {
          isPending: false,
          approvedAt: new Date(),
          approvedById: sessionUser.id,
        },
      });
    } else {
      // Rejeitar = remover sugestão
      await prisma.memberFunction.deleteMany({
        where: {
          memberId: params.id,
          roleFunctionId: { in: roleFunctionIds },
          isPending: true,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH member roles error:", error);
    return NextResponse.json({ error: "Erro ao processar aprovação" }, { status: 500 });
  }
}
