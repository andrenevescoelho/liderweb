export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { SessionUser } from "@/lib/types";

function canConfigure(role: string) {
  return role === "SUPERADMIN" || role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!canConfigure(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (!user.groupId && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Usuário sem ministério" }, { status: 400 });

  if (user.role === "SUPERADMIN") {
    return NextResponse.json({ enabled: false, accessMode: "SELECTED_MEMBERS", members: [] });
  }

  const [settings, members, enabledMembers] = await Promise.all([
    prisma.professorModuleSettings.findUnique({ where: { groupId: user.groupId! } }),
    prisma.user.findMany({
      where: { groupId: user.groupId, role: { not: "SUPERADMIN" } },
      include: { profile: true },
      orderBy: { name: "asc" },
    }),
    prisma.professorAccess.findMany({
      where: { groupId: user.groupId!, enabled: true },
      select: { userId: true },
    }),
  ]);

  const enabledSet = new Set(enabledMembers.map((item) => item.userId));

  return NextResponse.json({
    enabled: settings?.enabled ?? false,
    accessMode: settings?.accessMode ?? "SELECTED_MEMBERS",
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      memberFunction: member.profile?.memberFunction,
      enabled: enabledSet.has(member.id),
    })),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!canConfigure(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (!user.groupId || user.role === "SUPERADMIN") return NextResponse.json({ error: "Configuração indisponível" }, { status: 400 });

  const { enabled, accessMode, memberIds } = await req.json();

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled inválido" }, { status: 400 });
  }

  if (accessMode !== "ALL_MEMBERS" && accessMode !== "SELECTED_MEMBERS") {
    return NextResponse.json({ error: "accessMode inválido" }, { status: 400 });
  }

  const selectedIds = Array.isArray(memberIds) ? memberIds.filter((value) => typeof value === "string") : [];

  const members = await prisma.user.findMany({
    where: { groupId: user.groupId, id: { in: selectedIds } },
    select: { id: true },
  });

  const validMemberIds = members.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    await tx.professorModuleSettings.upsert({
      where: { groupId: user.groupId! },
      update: { enabled, accessMode, enabledBy: user.id },
      create: { groupId: user.groupId!, enabled, accessMode, enabledBy: user.id },
    });

    await tx.professorAccess.deleteMany({ where: { groupId: user.groupId! } });

    if (accessMode === "SELECTED_MEMBERS" && validMemberIds.length > 0) {
      await tx.professorAccess.createMany({
        data: validMemberIds.map((memberId) => ({
          groupId: user.groupId!,
          userId: memberId,
          enabled: true,
          enabledBy: user.id,
        })),
      });
    }
  });

  const ctx = extractRequestContext(req);
  await logUserAction({
    userId: user.id,
    groupId: user.groupId,
    action: enabled ? AUDIT_ACTIONS.PROFESSOR_MODULE_ENABLED : AUDIT_ACTIONS.PROFESSOR_MODULE_DISABLED,
    entityType: "PROFESSOR",
    description: enabled ? "Módulo Professor habilitado" : "Módulo Professor desabilitado",
    metadata: { accessMode, memberCount: validMemberIds.length },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  if (accessMode === "SELECTED_MEMBERS") {
    if (validMemberIds.length === 0) {
      await logUserAction({
        userId: user.id,
        groupId: user.groupId,
        action: AUDIT_ACTIONS.PROFESSOR_MEMBER_DISABLED,
        entityType: "PROFESSOR",
        description: "Lista de membros habilitados no módulo Professor foi esvaziada",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }

    for (const memberId of validMemberIds) {
      await logUserAction({
        userId: user.id,
        groupId: user.groupId,
        action: AUDIT_ACTIONS.PROFESSOR_MEMBER_ENABLED,
        entityType: "PROFESSOR",
        entityId: memberId,
        description: "Membro habilitado individualmente no módulo Professor",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
