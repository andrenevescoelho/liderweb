export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AnnouncementTargetAudience, AnnouncementTargetScope, AnnouncementType, AuditEntityType } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { resolveAnnouncementStatus } from "@/lib/announcements";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const announcements = await prisma.announcement.findMany({
    include: {
      createdByUser: { select: { id: true, name: true } },
      targetGroups: { include: { group: { select: { id: true, name: true } } } },
      _count: { select: { receipts: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return NextResponse.json({ announcements });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();
  const context = extractRequestContext(req);
  const now = new Date();

  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? "").trim();
  const type = Object.values(AnnouncementType).includes(body.type) ? body.type : AnnouncementType.INFO;
  const targetScope = Object.values(AnnouncementTargetScope).includes(body.targetScope)
    ? body.targetScope
    : AnnouncementTargetScope.ALL_PLATFORM;
  const targetAudience = Object.values(AnnouncementTargetAudience).includes(body.targetAudience)
    ? body.targetAudience
    : AnnouncementTargetAudience.ALL_USERS;
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const isActive = body.isActive !== false;
  const ctaLabel = body.ctaLabel ? String(body.ctaLabel).trim() : null;
  const ctaUrl = body.ctaUrl ? String(body.ctaUrl).trim() : null;
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map((id: string) => String(id)) : [];

  if (!title || !message) return NextResponse.json({ error: "Título e mensagem são obrigatórios" }, { status: 400 });
  if (startsAt && expiresAt && startsAt > expiresAt) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  if (targetScope === AnnouncementTargetScope.SELECTED_GROUPS && groupIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um ministério" }, { status: 400 });
  }

  const status = resolveAnnouncementStatus(isActive, startsAt, expiresAt, now);

  const announcement = await prisma.announcement.create({
    data: {
      title,
      message,
      type,
      targetScope,
      targetAudience,
      startsAt,
      expiresAt,
      status,
      isActive,
      ctaLabel,
      ctaUrl,
      priority,
      metadata,
      createdBy: user.id,
      targetGroups: groupIds.length ? { createMany: { data: groupIds.map((groupId: string) => ({ groupId })) } } : undefined,
    },
    include: { targetGroups: true },
  });

  await logUserAction({
    userId: user.id,
    action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
    entityType: AuditEntityType.ANNOUNCEMENT,
    entityId: announcement.id,
    entityName: announcement.title,
    description: `Comunicado criado: ${announcement.title}`,
    metadata: {
      targetScope,
      targetAudience,
      groupIds,
      startsAt: startsAt ? startsAt.toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    } as any,
    ...context,
  });

  return NextResponse.json({ announcement }, { status: 201 });
}