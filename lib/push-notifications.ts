import { messaging } from "@/lib/firebase-admin";
import { prisma } from "@/lib/db";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushToMany(tokens: string[], payload: PushPayload): Promise<number> {
  if (!tokens.length) return 0;

  try {
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    });

    console.log(`[push] sucesso: ${response.successCount}/${tokens.length}`);

    if (response.failureCount > 0) {
      console.warn("[push] falhas:", response.responses);
    }

    return response.successCount;
  } catch (err) {
    console.error("[push] erro multicast:", err);
    return 0;
  }
}

export async function getPushTokensForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];

  const sessions = await (prisma as any).userActiveSession.findMany({
    where: {
      userId: { in: userIds },
      pushToken: { not: null },
    },
    select: { pushToken: true },
  });

  return sessions.map((s: any) => s.pushToken).filter(Boolean);
}