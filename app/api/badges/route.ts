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
    if (!user.id || !user.groupId) return NextResponse.json({ escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0 });

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

    const [escalas, comunicados, ensaios, aniversariantes, musicas] = await Promise.all([
      // Escalas — convites pendentes de resposta do usuário
      prisma.scheduleRole.count({
        where: {
          memberId: user.id,
          status: "PENDING",
          schedule: { groupId: user.groupId, date: { gte: now } },
        },
      }),

      // Comunicados — não lidos (sem receipt ou sem viewedAt)
      (async () => {
        const all = await prisma.announcement.findMany({
          where: {
            isActive: true,
            status: "ACTIVE",
            OR: [
              { targetScope: "ALL_PLATFORM" },
              { targetGroups: { some: { groupId: user.groupId } } },
            ],
          },
          select: { id: true, receipts: { where: { userId: user.id }, select: { viewedAt: true } } },
        });
        return all.filter((a) => !a.receipts[0] || !a.receipts[0].viewedAt).length;
      })(),

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

      // Músicas adicionadas desde o último login
      prisma.song.count({
        where: {
          groupId: user.groupId,
          createdAt: { gte: lastLoginAt },
        },
      }),
    ]);

    // Chat — mensagens de outros membros nas últimas 24h
    const chat = await prisma.groupMessage.count({
      where: {
        groupId: user.groupId,
        senderUserId: { not: user.id },
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    return NextResponse.json({ escalas, comunicados, chat, ensaios, aniversariantes, musicas });
  } catch (err) {
    console.error("[badges] error:", err);
    return NextResponse.json({ escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0, musicas: 0 });
  }
}
