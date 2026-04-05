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

const PAGE_SIZE = 30;

/**
 * GET /api/dm/[userId]
 * Lista mensagens diretas entre o usuário logado e [userId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user as any;
    if (!session || !me?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const otherId = params.userId;
    if (me.id === otherId) {
      return NextResponse.json({ error: "Não é possível conversar consigo mesmo" }, { status: 400 });
    }

    // Verificar que ambos são do mesmo grupo
    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, name: true, groupId: true, lastLoginAt: true },
    });

    if (!other || other.groupId !== me.groupId) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const take = Math.min(Number(req.nextUrl.searchParams.get("take") || PAGE_SIZE), 100);
    const cursor = req.nextUrl.searchParams.get("cursor");

    const messages = await prisma.directMessage.findMany({
      where: {
        groupId: me.groupId,
        OR: [
          { senderUserId: me.id, receiverUserId: otherId },
          { senderUserId: otherId, receiverUserId: me.id },
        ],
      },
      include: {
        sender: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    // Marcar mensagens recebidas como lidas
    await prisma.directMessage.updateMany({
      where: {
        groupId: me.groupId,
        senderUserId: otherId,
        receiverUserId: me.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    const nextCursor = messages.length === take ? messages[messages.length - 1]?.id : null;

    return NextResponse.json({
      items: messages.reverse(),
      nextCursor,
      other: { id: other.id, name: other.name, lastLoginAt: other.lastLoginAt },
    });
  } catch (error) {
    console.error("GET dm error:", error);
    return NextResponse.json({ error: "Erro ao buscar mensagens" }, { status: 500 });
  }
}

/**
 * POST /api/dm/[userId]
 * Envia mensagem direta para [userId]
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const me = session?.user as any;
    if (!session || !me?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const otherId = params.userId;
    if (me.id === otherId) {
      return NextResponse.json({ error: "Não é possível enviar mensagem para si mesmo" }, { status: 400 });
    }

    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, groupId: true },
    });

    if (!other || other.groupId !== me.groupId) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Rate limit
    const rateLimit = checkRateLimit(`dm:${me.id}`, CHAT_RATE_LIMIT_WINDOW_MS, CHAT_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas mensagens em pouco tempo, tente novamente em instantes" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 1) } }
      );
    }

    const body = await req.json();
    const validation = validateMessageContent(body?.content);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const message = await prisma.directMessage.create({
      data: {
        groupId: me.groupId,
        senderUserId: me.id,
        receiverUserId: otherId,
        content: validation.content!,
      },
      include: {
        sender: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("POST dm error:", error);
    return NextResponse.json({ error: "Erro ao enviar mensagem" }, { status: 500 });
  }
}
