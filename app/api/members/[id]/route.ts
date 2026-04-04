export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { hasPermission } from "@/lib/authorization";
import { ensureDefaultRoleFunctions } from "@/lib/role-functions";
import { MEMBER_FUNCTION_OPTIONS } from "@/lib/member-profile";

const parseBirthDate = (birthDate?: string | null) => {
  if (!birthDate) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return new Date(`${birthDate}T12:00:00.000Z`);
  }
  const parsedDate = new Date(birthDate);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const hasRequestedPermissions = (permissions?: string[]) => {
  return Array.isArray(permissions) && permissions.length > 0;
};

const isGroupAdminProtected = (
  requester: { role: string },
  targetUser: { role: string }
) =>
  requester.role !== "SUPERADMIN" &&
  requester.role !== "ADMIN" &&
  targetUser.role === "ADMIN";

/** Inclui memberFunctions aprovadas no retorno do membro */
const includeMemberFunctions = {
  profile: true,
  memberFunctions: {
    where: { isPending: false },
    include: { roleFunction: { select: { name: true } } },
  },
} as const;

/** Sincroniza os roles do líder na tabela MemberFunction (aprovados direto) */
async function syncMemberFunctions(
  memberId: string,
  groupId: string,
  roleValues: string[]
) {
  const roleFunctionMap = await ensureDefaultRoleFunctions(groupId);

  // Busca functions atuais aprovadas
  const current = await prisma.memberFunction.findMany({
    where: { memberId, isPending: false },
    select: { id: true, roleFunctionId: true },
  });

  const desiredIds = new Set(
    roleValues
      .map((v) => roleFunctionMap[v as keyof typeof roleFunctionMap])
      .filter(Boolean)
  );

  const currentIds = new Set(current.map((c) => c.roleFunctionId));

  // Remover os que não estão mais na lista
  const toRemove = current
    .filter((c) => !desiredIds.has(c.roleFunctionId))
    .map((c) => c.id);

  if (toRemove.length > 0) {
    await prisma.memberFunction.deleteMany({ where: { id: { in: toRemove } } });
  }

  // Adicionar os novos
  for (const roleFunctionId of desiredIds) {
    if (!currentIds.has(roleFunctionId)) {
      await prisma.memberFunction.create({
        data: {
          memberId,
          roleFunctionId,
          isPending: false,
          approvedAt: new Date(),
        },
      });
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para visualizar membro" }, { status: 403 });
    }

    const member = await prisma.user.findUnique({
      where: { id: params?.id },
      include: includeMemberFunctions,
    });

    if (!member) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && member.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    // Serializa roles aprovados como array de values (ex: ["VOCAL", "TECLADO"])
    const approvedRoles = member.memberFunctions.map((mf) => {
      const option = MEMBER_FUNCTION_OPTIONS.find(
        (o) => o.label === mf.roleFunction.name
      );
      return option?.value ?? mf.roleFunction.name;
    });

    return NextResponse.json({ ...member, approvedRoles });
  } catch (error) {
    console.error("Get member error:", error);
    return NextResponse.json({ error: "Erro ao buscar membro" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;

    if (!session || !sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para gerenciar membros" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      role,
      // roles[] substitui instruments + memberFunction (fonte única)
      roles,
      voiceType,
      vocalRange,
      comfortableKeys,
      availability,
      phone,
      birthDate,
      active,
      leadershipRole,
      permissions,
    } = body ?? {};

    const updateData: any = {};
    if (name) updateData.name = name;
    if (role && requester.role !== "LEADER") updateData.role = role;

    const targetUser = await prisma.user.findUnique({ where: { id: params?.id } });

    if (!targetUser) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && targetUser.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (isGroupAdminProtected(requester, targetUser)) {
      return NextResponse.json(
        { error: "O administrador do grupo só pode ser alterado por um admin do grupo ou superadmin global." },
        { status: 403 }
      );
    }

    const canManagePermissions =
      requester.role === "SUPERADMIN" ||
      requester.role === "ADMIN" ||
      hasPermission(requester.role as any, "permission.manage", requester.profile?.permissions);

    if (hasRequestedPermissions(permissions) && requester.id !== targetUser.id && !canManagePermissions) {
      return NextResponse.json({ error: "Sem permissão para alterar permissões de outros membros" }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: params?.id },
      data: updateData,
    });

    await prisma.memberProfile.upsert({
      where: { userId: params?.id },
      update: {
        voiceType: voiceType ?? null,
        vocalRange: vocalRange ?? null,
        comfortableKeys: comfortableKeys ?? [],
        availability: availability ?? [],
        phone: phone ?? null,
        birthDate: parseBirthDate(birthDate),
        active: active ?? true,
        leadershipRole: leadershipRole ?? null,
        ...(canManagePermissions ? { permissions: permissions ?? [] } : {}),
      },
      create: {
        userId: params?.id,
        voiceType: voiceType ?? null,
        vocalRange: vocalRange ?? null,
        comfortableKeys: comfortableKeys ?? [],
        availability: availability ?? [],
        phone: phone ?? null,
        birthDate: parseBirthDate(birthDate),
        active: active ?? true,
        leadershipRole: leadershipRole ?? null,
        ...(canManagePermissions ? { permissions: permissions ?? [] } : {}),
      },
    });

    // Sincroniza roles na tabela MemberFunction (líder aprova direto)
    if (Array.isArray(roles) && targetUser.groupId) {
      await syncMemberFunctions(params?.id, targetUser.groupId, roles);
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: params?.id },
      include: includeMemberFunctions,
    });

    const approvedRoles = (updatedUser?.memberFunctions ?? []).map((mf) => {
      const option = MEMBER_FUNCTION_OPTIONS.find(
        (o) => o.label === mf.roleFunction.name
      );
      return option?.value ?? mf.roleFunction.name;
    });

    return NextResponse.json({ ...updatedUser, approvedRoles });
  } catch (error) {
    console.error("Update member error:", error);
    return NextResponse.json({ error: "Erro ao atualizar membro" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as SessionUser | undefined;

    if (!session || !sessionUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const requester = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: { profile: true },
    });

    if (!requester || !hasPermission(requester.role, "member.manage", requester.profile?.permissions)) {
      return NextResponse.json({ error: "Sem permissão para excluir membros" }, { status: 403 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: params?.id } });

    if (!targetUser) {
      return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    }

    if (requester.role !== "SUPERADMIN" && targetUser.groupId !== requester.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (isGroupAdminProtected(requester, targetUser)) {
      return NextResponse.json(
        { error: "O administrador do grupo só pode ser alterado por um admin do grupo ou superadmin global." },
        { status: 403 }
      );
    }

    await prisma.user.delete({ where: { id: params?.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete member error:", error);
    return NextResponse.json({ error: "Erro ao excluir membro" }, { status: 500 });
  }
}
