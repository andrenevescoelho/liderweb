export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * GET /api/dm/unread
 * Retorna contagem de mensagens não lidas por remetente
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user as any;
    if (!session || !me?.id || !me?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const unread = await prisma.directMessage.groupBy({
      by: ["senderUserId"],
      where: {
        groupId: me.groupId,
        receiverUserId: me.id,
        readAt: null,
      },
      _count: { id: true },
    });

    // { senderId: count }
    const result: Record<string, number> = {};
    for (const row of unread) {
      result[row.senderUserId] = row._count.id;
    }

    const total = unread.reduce((acc, r) => acc + r._count.id, 0);

    return NextResponse.json({ byUser: result, total });
  } catch (error) {
    console.error("GET dm/unread error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
