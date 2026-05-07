// lib/push-notifications.ts
// Envia push notifications via Firebase Cloud Messaging (FCM)

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY!;
const FCM_URL = "https://fcm.googleapis.com/fcm/send";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  icon?: string;
}

// Enviar para um único token
export async function sendPush(token: string, payload: PushPayload): Promise<boolean> {
  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon ?? "/favicon.svg",
          sound: "default",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
        data: payload.data ?? {},
        priority: "high",
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channel_id: "liderweb_default",
          },
        },
      }),
    });

    const result = await res.json();
    if (result.failure > 0) {
      console.warn("[push] Falha ao enviar para token:", token, result);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push] Erro FCM:", err);
    return false;
  }
}

// Enviar para múltiplos tokens (até 1000 por vez — limite FCM)
export async function sendPushToMany(tokens: string[], payload: PushPayload): Promise<number> {
  if (!tokens.length) return 0;

  try {
    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${FCM_SERVER_KEY}`,
      },
      body: JSON.stringify({
        registration_ids: tokens.slice(0, 1000),
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon ?? "/favicon.svg",
          sound: "default",
        },
        data: payload.data ?? {},
        priority: "high",
      }),
    });

    const result = await res.json();
    const success = result.success ?? 0;
    console.log(`[push] Enviado para ${success}/${tokens.length} dispositivos`);
    return success;
  } catch (err) {
    console.error("[push] Erro FCM multicast:", err);
    return 0;
  }
}

// Buscar tokens ativos de uma lista de userIds
import { prisma } from "@/lib/db";

export async function getPushTokensForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const sessions = await (prisma as any).userActiveSession.findMany({
      where: { userId: { in: userIds } },
      select: { pushToken: true },
    });
    return sessions
      .map((s: any) => s.pushToken)
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

// Buscar tokens de todos os membros de um grupo
export async function getPushTokensForGroup(groupId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { groupId },
    select: { id: true },
  });

  return getPushTokensForUsers(users.map((u) => u.id));
}
