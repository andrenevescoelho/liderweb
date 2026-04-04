export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

function parseTs(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const ms = Number(value);
  return isNaN(ms) ? fallback : new Date(ms);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    // SUPERADMIN — retornar tickets abertos
    if (user.role === "SUPERADMIN") {
      const openTickets = await (prisma as any).supportTicket.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }).catch(() => 0);
      return NextResponse.json({ escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0, musicas: 0, tickets: openTickets, pendingRoles: 0 });
    }

    if (!user.id || !user.groupId) return NextResponse.json({ escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0, musicas: 0, tickets: 0, pendingRoles: 0 });

    const now = new Date();
    const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Buscar o penúltimo login do usuário (o último é o atual)
    const lastLogins = await prisma.auditLog.findMany({
      where: { userId: user.id, action: "LOGIN_SUCCESS" },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { createdAt: true },
    });
    const lastLoginAt = lastLogins[1]?.createdAt ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Timestamps do localStorage enviados pelo hook
    const sp = request.nextUrl.searchParams;
    const seenChat = parseTs(sp.get("seen_chat"), new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const seenComunicados = parseTs(sp.get("seen_comunicados"), new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const seenMusicas = parseTs(sp.get("seen_musicas"), lastLoginAt);

    const [escalas, comunicados, ensaios, aniversariantes, musicas] = await Promise.all([
      // Escalas — convites pendentes de resposta do usuário
      prisma.scheduleRole.count({
        where: {
          memberId: user.id,
          status: "PENDING",
          schedule: { groupId: user.groupId, date: { gte: now } },
        },
      }),

      // Comunicados — broadcasts do grupo não vistos
      prisma.groupBroadcast.count({
        where: {
          groupId: user.groupId,
          senderUserId: { not: user.id },
          createdAt: { gte: seenComunicados },
        },
      }),

      // Ensaios — próximo ensaio nos próximos 3 dias
      prisma.rehearsal.count({
        where: {
          groupId: user.groupId,
          status: "PUBLISHED",
          dateTime: { gte: now, lte: in3days },
        },
      }),

      // Aniversariantes hoje
      (async () => {
        const members = await prisma.memberProfile.findMany({
          where: { user: { groupId: user.groupId }, active: true, birthDate: { not: null } },
          select: { birthDate: true },
        });
        const today = { day: now.getDate(), month: now.getMonth() + 1 };
        return members.filter((m) => {
          if (!m.birthDate) return false;
          const d = new Date(m.birthDate);
          return d.getDate() === today.day && d.getMonth() + 1 === today.month;
        }).length;
      })(),

      // Músicas adicionadas desde a última visita
      prisma.song.count({
        where: {
          groupId: user.groupId,
          createdAt: { gte: seenMusicas },
        },
      }),
    ]);

    // Chat — mensagens de outros membros desde a última visita
    const chat = await prisma.groupMessage.count({
      where: {
        groupId: user.groupId,
        senderUserId: { not: user.id },
        createdAt: { gte: seenChat },
      },
    });

    // Sugestões de roles pendentes — só para quem pode gerenciar membros
    let pendingRoles = 0;
    if (user.role === "ADMIN" || user.role === "LEADER") {
      pendingRoles = await prisma.memberFunction.count({
        where: {
          isPending: true,
          member: { groupId: user.groupId },
        },
      });
    }

    return NextResponse.json({ escalas, comunicados, chat, ensaios, aniversariantes, musicas, tickets: 0, pendingRoles });
  } catch (err) {
    console.error("[badges] error:", err);
    return NextResponse.json({ escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0, musicas: 0, tickets: 0 });
  }
}
