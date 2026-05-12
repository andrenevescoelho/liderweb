import { prisma } from "@/lib/db";

const DEFAULT_PREFS: Record<string, boolean> = {
  schedule_published_push: true,  schedule_published_email: true,
  schedule_pending_push: true,    schedule_pending_email: false,
  schedule_approved_push: true,   schedule_approved_email: false,
  rehearsal_created_push: true,   rehearsal_created_email: true,
  broadcast_push: true,           broadcast_email: false,
  chat_push: true,                chat_email: false,
  dm_push: true,                  dm_email: true,
  invite_accepted_push: true,     invite_accepted_email: true,
};

export async function userWantsNotification(userId: string, key: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT "notificationPreferences" FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    const prefs = { ...DEFAULT_PREFS, ...(result?.[0]?.notificationPreferences ?? {}) };
    return prefs[key] !== false;
  } catch {
    return DEFAULT_PREFS[key] !== false;
  }
}

export async function filterUsersByNotifPref(userIds: string[], key: string): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT id, "notificationPreferences" FROM "User" WHERE id = ANY(${userIds}::text[])
    `;
    return result
      .filter((u: any) => {
        const prefs = { ...DEFAULT_PREFS, ...(u.notificationPreferences ?? {}) };
        return prefs[key] !== false;
      })
      .map((u: any) => u.id);
  } catch {
    return userIds;
  }
}
