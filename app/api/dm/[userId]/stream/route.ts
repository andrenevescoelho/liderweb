export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * GET /api/dm/[userId]/stream
 * SSE — envia novas mensagens diretas em tempo real
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions);
  const me = session?.user as any;

  if (!session || !me?.id) {
    return new Response("Não autorizado", { status: 401 });
  }

  const otherId = params.userId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSentAt = new Date(0);

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const pingInterval = setInterval(() => {
        send("ping", { ts: Date.now() });
      }, 15_000);

      const pollInterval = setInterval(async () => {
        try {
          const latest = await prisma.directMessage.findFirst({
            where: {
              groupId: me.groupId,
              OR: [
                { senderUserId: me.id, receiverUserId: otherId },
                { senderUserId: otherId, receiverUserId: me.id },
              ],
              createdAt: { gt: lastSentAt },
            },
            include: {
              sender: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
          });

          if (latest) {
            lastSentAt = latest.createdAt;
            send("message", latest);
          }
        } catch (error) {
          console.error("DM stream error:", error);
        }
      }, 2_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(pingInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
