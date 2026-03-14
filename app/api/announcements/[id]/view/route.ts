export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { AuditEntityType } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || !user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const announcementId = params.id;
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

  const now = new Date();

  await prisma.announcementReceipt.upsert({
    where: {
      announcementId_userId: {
        announcementId,
        userId: user.id,
      },
    },
    create: {
      announcementId,
      userId: user.id,
      deliveredAt: now,
      viewedAt: now,
      dismissedAt: now,
    },
    update: {
      viewedAt: now,
      dismissedAt: now,
    },
  });

  await logUserAction({
    userId: user.id,
    groupId: user.groupId,
    action: AUDIT_ACTIONS.ANNOUNCEMENT_VIEWED,
    entityType: AuditEntityType.ANNOUNCEMENT,
    entityId: announcementId,
    entityName: announcement.title,
    description: `Comunicado visualizado: ${announcement.title}`,
    ...extractRequestContext(req),
  });

  return NextResponse.json({ ok: true });
}
