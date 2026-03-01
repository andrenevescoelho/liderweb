export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import {
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  validateMessageContent,
} from "@/lib/messages";

const PAGE_SIZE_DEFAULT = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { groupId } = params;
    const userInGroup = user.role === "SUPERADMIN" || user.groupId === groupId;

    if (!userInGroup) {
      return NextResponse.json({ error: "Sem permissão para acessar o chat deste grupo" }, { status: 403 });
    }

    const take = Math.min(Number(req.nextUrl.searchParams.get("take") || PAGE_SIZE_DEFAULT), 100);
    const cursor = req.nextUrl.searchParams.get("cursor");

    const messages = await prisma.groupMessage.findMany({
      where: { groupId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });

    const nextCursor = messages.length === take ? messages[messages.length - 1]?.id : null;

    return NextResponse.json({
      items: messages.reverse(),
      nextCursor,
    });
  } catch (error) {
    console.error("List group messages error:", error);
    return NextResponse.json({ error: "Erro ao listar mensagens do grupo" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { groupId: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { groupId } = params;
    const userInGroup = user.role === "SUPERADMIN" || user.groupId === groupId;

    if (!userInGroup) {
      return NextResponse.json({ error: "Sem permissão para enviar mensagens neste grupo" }, { status: 403 });
    }

    const rateLimit = checkRateLimit(
      `chat:${user.id}:${groupId}`,
      CHAT_RATE_LIMIT_WINDOW_MS,
      CHAT_RATE_LIMIT_MAX,
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens em pouco tempo, tente novamente em instantes" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds ?? 1),
          },
        },
      );
    }

    const body = await req.json();
    const validation = validateMessageContent(body?.content);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        senderUserId: user.id,
        content: validation.content!,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Send group message error:", error);
    return NextResponse.json({ error: "Erro ao enviar mensagem" }, { status: 500 });
  }
}
