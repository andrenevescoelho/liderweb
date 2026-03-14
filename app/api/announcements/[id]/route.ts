export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AnnouncementTargetAudience, AnnouncementTargetScope, AnnouncementType, AuditEntityType } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { resolveAnnouncementStatus } from "@/lib/announcements";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const announcementId = params.id;
  const existing = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!existing) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

  const body = await req.json();
  const context = extractRequestContext(req);

  const title = String(body.title ?? existing.title).trim();
  const message = String(body.message ?? existing.message).trim();
  const type = Object.values(AnnouncementType).includes(body.type) ? body.type : existing.type;
  const targetScope = Object.values(AnnouncementTargetScope).includes(body.targetScope) ? body.targetScope : existing.targetScope;
  const targetAudience = Object.values(AnnouncementTargetAudience).includes(body.targetAudience)
    ? body.targetAudience
    : existing.targetAudience;
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive;
  const ctaLabel = body.ctaLabel ? String(body.ctaLabel).trim() : null;
  const ctaUrl = body.ctaUrl ? String(body.ctaUrl).trim() : null;
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : existing.priority;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : null;
  const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map((id: string) => String(id)) : [];

  if (!title || !message) return NextResponse.json({ error: "Título e mensagem são obrigatórios" }, { status: 400 });
  if (startsAt && expiresAt && startsAt > expiresAt) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  if (targetScope === AnnouncementTargetScope.SELECTED_GROUPS && groupIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um ministério" }, { status: 400 });
  }

  const status = resolveAnnouncementStatus(isActive, startsAt, expiresAt);

  const announcement = await prisma.$transaction(async (tx) => {
    await tx.announcementGroup.deleteMany({ where: { announcementId } });

    return tx.announcement.update({
      where: { id: announcementId },
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
        targetGroups: groupIds.length ? { createMany: { data: groupIds.map((groupId: string) => ({ groupId })) } } : undefined,
      },
    });
  });

  await logUserAction({
    userId: user.id,
    action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
    entityType: AuditEntityType.ANNOUNCEMENT,
    entityId: announcement.id,
    entityName: announcement.title,
    description: `Comunicado atualizado: ${announcement.title}`,
    metadata: { groupIds, targetScope, targetAudience },
    ...context,
  });

  if (existing.isActive !== announcement.isActive) {
    await logUserAction({
      userId: user.id,
      action: announcement.isActive ? AUDIT_ACTIONS.ANNOUNCEMENT_ACTIVATED : AUDIT_ACTIONS.ANNOUNCEMENT_DEACTIVATED,
      entityType: AuditEntityType.ANNOUNCEMENT,
      entityId: announcement.id,
      entityName: announcement.title,
      description: `Comunicado ${announcement.isActive ? "ativado" : "desativado"}: ${announcement.title}`,
      ...context,
    });
  }

  return NextResponse.json({ announcement });
}
