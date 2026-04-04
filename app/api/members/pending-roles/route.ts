export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";
import { MEMBER_FUNCTION_OPTIONS } from "@/lib/member-profile";

/**
 * GET /api/members/pending-roles
 * Retorna todas as sugestões de roles pendentes do grupo para o líder aprovar.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const sessionUser = session.user as SessionUser;
    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (
      !requester ||
      !hasPermission(requester.role, "member.manage", requester.profile?.permissions)
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (!requester.groupId && requester.role !== "SUPERADMIN") {
      return NextResponse.json([]);
    }

    const pending = await prisma.memberFunction.findMany({
      where: {
        isPending: true,
        member: {
          groupId: requester.role === "SUPERADMIN" ? undefined : requester.groupId!,
        },
      },
      include: {
        member: { select: { id: true, name: true } },
        roleFunction: { select: { name: true } },
      },
      orderBy: { suggestedAt: "asc" },
    });

    const result = pending.map((p) => {
      const option = MEMBER_FUNCTION_OPTIONS.find(
        (o) => o.label === p.roleFunction.name
      );
      return {
        id: p.id,
        memberId: p.member.id,
        memberName: p.member.name,
        roleValue: option?.value ?? p.roleFunction.name,
        roleLabel: p.roleFunction.name,
        suggestedAt: p.suggestedAt,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET pending-roles error:", error);
    return NextResponse.json({ error: "Erro ao buscar sugestões" }, { status: 500 });
  }
}
