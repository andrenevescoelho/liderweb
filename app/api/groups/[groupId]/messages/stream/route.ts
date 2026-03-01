export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || !user?.id) {
    return new Response("Não autorizado", { status: 401 });
  }

  const { groupId } = params;
  const userInGroup = user.role === "SUPERADMIN" || user.groupId === groupId;

  if (!userInGroup) {
    return new Response("Sem permissão", { status: 403 });
  }

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
          const latest = await prisma.groupMessage.findFirst({
            where: {
              groupId,
              createdAt: {
                gt: lastSentAt,
              },
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          });

          if (latest) {
            lastSentAt = latest.createdAt;
            send("message", latest);
          }
        } catch (error) {
          send("error", { message: "Erro ao atualizar mensagens em tempo real" });
          console.error("Group messages stream error:", error);
        }
      }, 3_000);

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
