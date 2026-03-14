import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;
  const { groupId } = params;

  if (user.role !== "SUPERADMIN" && user.groupId !== groupId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      users: {
        include: { profile: true },
      },
      _count: {
        select: { songs: true, setlists: true, schedules: true },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  return NextResponse.json(group);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;
  const { groupId } = params;

  if (user.role !== "SUPERADMIN" && (user.role !== "ADMIN" || user.groupId !== groupId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, active } = body;
  const context = extractRequestContext(req);

  const before = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, description: true, active: true } });
  if (!before) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  const group = await prisma.group.update({
    where: { id: groupId },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(active !== undefined && { active }),
    },
  });

  await logUserAction({
    userId: user.id,
    groupId: group.id,
    action: AUDIT_ACTIONS.GROUP_UPDATED,
    entityType: AuditEntityType.GROUP,
    entityId: group.id,
    entityName: group.name,
    description: `Usuário ${user.name} atualizou o grupo ${group.name}`,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    oldValues: before,
    newValues: { name: group.name, description: group.description, active: group.active },
  });

  return NextResponse.json(group);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;

  if (user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { groupId } = params;
  const context = extractRequestContext(req);

  const before = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true, description: true, active: true } });
  if (!before) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  await prisma.group.delete({ where: { id: groupId } });

  await logUserAction({
    userId: user.id,
    groupId,
    action: AUDIT_ACTIONS.GROUP_DELETED,
    entityType: AuditEntityType.GROUP,
    entityId: before.id,
    entityName: before.name,
    description: `Usuário ${user.name} excluiu o grupo ${before.name}`,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    oldValues: before,
  });

  return NextResponse.json({ success: true });
}
