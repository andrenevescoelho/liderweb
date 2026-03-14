import { AnnouncementStatus, AnnouncementTargetAudience, AnnouncementTargetScope, Role, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AnnouncementViewer {
  id: string;
  role: Role;
  groupId?: string | null;
}

export function resolveAnnouncementStatus(isActive: boolean, startsAt: Date | null, expiresAt: Date | null, now = new Date()): AnnouncementStatus {
  if (!isActive) return AnnouncementStatus.INACTIVE;
  if (expiresAt && expiresAt < now) return AnnouncementStatus.EXPIRED;
  if (!startsAt || startsAt <= now) return AnnouncementStatus.ACTIVE;
  return AnnouncementStatus.DRAFT;
}

export function buildEligibilityWhere(viewer: AnnouncementViewer, now = new Date()): Prisma.AnnouncementWhereInput {
  const audienceFilter: Prisma.AnnouncementWhereInput =
    viewer.role === "ADMIN" || viewer.role === "SUPERADMIN"
      ? { targetAudience: { in: [AnnouncementTargetAudience.ALL_USERS, AnnouncementTargetAudience.ADMINS_ONLY] } }
      : { targetAudience: AnnouncementTargetAudience.ALL_USERS };

  const scopeFilter: Prisma.AnnouncementWhereInput = viewer.groupId
    ? {
        OR: [
          { targetScope: AnnouncementTargetScope.ALL_PLATFORM },
          {
            targetScope: AnnouncementTargetScope.SELECTED_GROUPS,
            targetGroups: { some: { groupId: viewer.groupId } },
          },
        ],
      }
    : { targetScope: AnnouncementTargetScope.ALL_PLATFORM };

  return {
    isActive: true,
    status: AnnouncementStatus.ACTIVE,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      audienceFilter,
      scopeFilter,
    ],
  };
}

export async function getPendingAnnouncementsForUser(viewer: AnnouncementViewer) {
  return prisma.announcement.findMany({
    where: {
      ...buildEligibilityWhere(viewer),
      receipts: {
        none: {
          userId: viewer.id,
          viewedAt: { not: null },
        },
      },
    },
    include: {
      targetGroups: { include: { group: { select: { id: true, name: true } } } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 10,
  });
}
