export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import {
  BROADCAST_RATE_LIMIT_MAX,
  BROADCAST_RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  isBroadcastSenderRole,
  validateMessageContent,
} from "@/lib/messages";

const PAGE_SIZE_DEFAULT = 20;

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
      return NextResponse.json({ error: "Sem permissão para acessar comunicados deste grupo" }, { status: 403 });
    }

    const take = Math.min(Number(req.nextUrl.searchParams.get("take") || PAGE_SIZE_DEFAULT), 100);
    const cursor = req.nextUrl.searchParams.get("cursor");

    const broadcasts = await prisma.groupBroadcast.findMany({
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

    const nextCursor = broadcasts.length === take ? broadcasts[broadcasts.length - 1]?.id : null;

    return NextResponse.json({
      items: broadcasts,
      nextCursor,
    });
  } catch (error) {
    console.error("List broadcasts error:", error);
    return NextResponse.json({ error: "Erro ao listar comunicados" }, { status: 500 });
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
      return NextResponse.json({ error: "Sem permissão para enviar comunicado neste grupo" }, { status: 403 });
    }

    if (!isBroadcastSenderRole(user.role)) {
      return NextResponse.json({ error: "Apenas ADMIN/SUPERADMIN podem enviar comunicados" }, { status: 403 });
    }

    const rateLimit = checkRateLimit(
      `broadcast:${user.id}:${groupId}`,
      BROADCAST_RATE_LIMIT_WINDOW_MS,
      BROADCAST_RATE_LIMIT_MAX,
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitos comunicados em pouco tempo, tente novamente em instantes" },
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

    const broadcast = await prisma.groupBroadcast.create({
      data: {
        groupId,
        senderUserId: user.id,
        senderRole: user.role,
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

    return NextResponse.json(broadcast, { status: 201 });
  } catch (error) {
    console.error("Create broadcast error:", error);
    return NextResponse.json({ error: "Erro ao enviar comunicado" }, { status: 500 });
  }
}
