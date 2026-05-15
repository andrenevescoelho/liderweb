export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function canAccess(role: string) {
  return ["SUPERADMIN", "ADMIN", "LEADER"].includes(role);
}

const MOOD_SCORES: Record<string, number> = {
  MOTIVADO: 100,
  BEM: 80,
  NEUTRO: 60,
  DESANIMADO: 30,
  MUITO_MAL: 0,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Total de membros
    const members = await prisma.user.findMany({
      where: { groupId: user.groupId, role: { not: "SUPERADMIN" } },
      select: { id: true },
    });
    const totalMembers = members.length;
    if (totalMembers === 0) return NextResponse.json({ score: null, components: {} });

    // ── 1. Humor emocional (30%) ────────────────────────────────────────────
    const checkins = await prisma.$queryRaw<any[]>`
      SELECT mood FROM "EmotionalCheckin"
      WHERE "groupId" = ${user.groupId}
      AND "createdAt" >= ${sevenDaysAgo}
    `;
    let moodScore = 60; // default neutro se não houver check-ins
    if (checkins.length > 0) {
      const total = checkins.reduce((acc, c) => acc + (MOOD_SCORES[c.mood] ?? 60), 0);
      moodScore = Math.round(total / checkins.length);
    }
    const checkinEngagement = Math.min(100, Math.round((checkins.length / (totalMembers * 3)) * 100)); // 3 check-ins/semana = 100%

    // ── 2. Confirmação de escalas (25%) ─────────────────────────────────────
    const scheduleRoles = await prisma.$queryRaw<any[]>`
      SELECT sr.status FROM "ScheduleRole" sr
      INNER JOIN "Schedule" s ON s.id = sr."scheduleId"
      WHERE s."groupId" = ${user.groupId}
      AND s.date >= ${thirtyDaysAgo}
      AND s.status IN ('PUBLISHED', 'APPROVED')
    `.catch(() => []);

    let scheduleScore = 70; // default
    if (scheduleRoles.length > 0) {
      const confirmed = scheduleRoles.filter((r: any) => r.status === "ACCEPTED").length;
      scheduleScore = Math.round((confirmed / scheduleRoles.length) * 100);
    }

    // ── 3. Presença nos ensaios (25%) ────────────────────────────────────────
    const rehearsalAttendances = await prisma.$queryRaw<any[]>`
      SELECT ra.status FROM "RehearsalAttendance" ra
      INNER JOIN "Rehearsal" r ON r.id = ra."rehearsalId"
      WHERE r."groupId" = ${user.groupId}
      AND r."dateTime" >= ${thirtyDaysAgo}
    `.catch(() => []);

    let rehearsalScore = 70; // default
    if (rehearsalAttendances.length > 0) {
      const present = rehearsalAttendances.filter((r: any) => r.status === "PRESENT").length;
      rehearsalScore = Math.round((present / rehearsalAttendances.length) * 100);
    }

    // ── 4. Engajamento no app (20%) ──────────────────────────────────────────
    // % de membros que fizeram check-in nos últimos 7 dias
    const uniqueCheckinMembers = await prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT "memberId") as count FROM "EmotionalCheckin"
      WHERE "groupId" = ${user.groupId}
      AND "createdAt" >= ${sevenDaysAgo}
    `;
    const engagementScore = Math.min(100, Math.round(
      (parseInt(uniqueCheckinMembers[0]?.count ?? 0) / totalMembers) * 100
    ));

    // ── Calcular índice final ────────────────────────────────────────────────
    const finalScore = Math.round(
      moodScore * 0.30 +
      scheduleScore * 0.25 +
      rehearsalScore * 0.25 +
      engagementScore * 0.20
    );

    const getStatus = (score: number) => {
      if (score >= 80) return { label: "Excelente", color: "green" };
      if (score >= 65) return { label: "Saudável", color: "green" };
      if (score >= 50) return { label: "Atenção", color: "yellow" };
      return { label: "Crítico", color: "red" };
    };

    return NextResponse.json({
      score: finalScore,
      status: getStatus(finalScore),
      components: {
        mood:        { score: moodScore,        weight: 30, label: "Humor emocional",        checkins: checkins.length },
        schedule:    { score: scheduleScore,    weight: 25, label: "Confirmação de escalas", total: scheduleRoles.length },
        rehearsal:   { score: rehearsalScore,   weight: 25, label: "Presença nos ensaios",   total: rehearsalAttendances.length },
        engagement:  { score: engagementScore,  weight: 20, label: "Engajamento no app",     checkinMembers: parseInt(uniqueCheckinMembers[0]?.count ?? 0) },
      },
      totalMembers,
    });
  } catch (e) {
    console.error("Health score error:", e);
    return NextResponse.json({ error: "Erro ao calcular índice" }, { status: 500 });
  }
}
