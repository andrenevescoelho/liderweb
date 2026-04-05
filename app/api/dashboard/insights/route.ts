export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as SessionUser;
    const canAccess =
      user.role === "ADMIN" ||
      user.role === "LEADER" ||
      (user as any).permissions?.includes("report.group.access");

    if (!canAccess || !user.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const groupId = user.groupId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      // Equipe
      totalMembers,
      membersWithoutServing,
      memberLoad,

      // Repertório
      songsUnused6M,
      songsNewMonth,
      totalSongs,

      // Escalas
      schedulesThisMonth,
      schedulesPrevMonth,
      schedulesByMonth,

      // Professor IA
      coachProfiles,
      practiceSubmissionsMonth,

      // Confirmações
      pendingConfirmations,
    ] = await Promise.all([
      // Total membros ativos
      prisma.user.count({
        where: { groupId, role: { not: "SUPERADMIN" }, profile: { is: { active: true } } },
      }),

      // Membros sem participar há 30 dias
      prisma.user.findMany({
        where: {
          groupId,
          role: { not: "SUPERADMIN" },
          profile: { is: { active: true } },
          scheduleRoles: { none: { schedule: { date: { gte: thirtyDaysAgo }, groupId } } },
        },
        select: { id: true, name: true },
        take: 5,
      }),

      // Carga por membro (últimos 6 meses)
      prisma.scheduleRole.groupBy({
        by: ["memberId"],
        where: {
          schedule: { groupId, date: { gte: sixMonthsAgo } },
          memberId: { not: null },
          status: "ACCEPTED",
        },
        _count: { _all: true },
      }),

      // Músicas sem uso em 6 meses
      prisma.song.findMany({
        where: {
          groupId,
          setlistItems: {
            none: {
              setlist: { schedules: { some: { date: { gte: sixMonthsAgo } } } },
            },
          },
        },
        select: { id: true, title: true },
        take: 5,
      }),

      // Músicas novas esse mês
      prisma.song.count({ where: { groupId, createdAt: { gte: monthStart } } }),

      // Total de músicas
      prisma.song.count({ where: { groupId } }),

      // Escalas esse mês
      prisma.schedule.count({ where: { groupId, createdAt: { gte: monthStart } } }),

      // Escalas mês passado
      prisma.schedule.count({
        where: {
          groupId,
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
            lt: monthStart,
          },
        },
      }),

      // Escalas por mês (últimos 4 meses)
      Promise.all(
        Array.from({ length: 4 }).map(async (_, i) => {
          const start = new Date(now.getFullYear(), now.getMonth() - (3 - i), 1);
          const end = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
          const count = await prisma.schedule.count({
            where: { groupId, createdAt: { gte: start, lt: end } },
          });
          return {
            month: start.toLocaleDateString("pt-BR", { month: "short" }),
            count,
          };
        })
      ),

      // Professor IA — perfis do grupo
      prisma.musicCoachProfile.findMany({
        where: { groupId },
        select: { enabled: true, level: true, userId: true },
      }),

      // Práticas enviadas esse mês
      prisma.practiceSubmission.count({
        where: { groupId, createdAt: { gte: monthStart } },
      }),

      // Confirmações pendentes (próximas escalas)
      prisma.scheduleRole.count({
        where: {
          schedule: { groupId, date: { gte: now } },
          status: "PENDING",
        },
      }),
    ]);

    // Processar carga de membros
    const memberLoadSorted = [...memberLoad].sort((a, b) => b._count._all - a._count._all).slice(0, 3);
    const memberIds = memberLoadSorted.map((m) => m.memberId).filter(Boolean) as string[];
    const memberNames = memberIds.length
      ? await prisma.user.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, name: true },
        })
      : [];

    const topMembersLoad = memberLoadSorted.map((m) => ({
      name: memberNames.find((u) => u.id === m.memberId)?.name ?? "Membro",
      count: m._count._all,
    }));

    const maxLoad = topMembersLoad[0]?.count ?? 0;
    const avgLoad = totalMembers > 0
      ? Math.round(memberLoad.reduce((a, b) => a + b._count._all, 0) / memberLoad.length)
      : 0;
    const overloaded = maxLoad > 0 && avgLoad > 0 && maxLoad > avgLoad * 2
      ? topMembersLoad[0]
      : null;

    // Professor IA
    const coachEnabled = coachProfiles.filter((p) => p.enabled).length;
    const avgLevel =
      coachProfiles.length > 0
        ? Number(
            (
              coachProfiles.reduce((a, b) => a + b.level, 0) / coachProfiles.length
            ).toFixed(1)
          )
        : null;

    // Tendência de escalas
    const schedulesTrend =
      schedulesPrevMonth > 0
        ? Math.round(
            ((schedulesThisMonth - schedulesPrevMonth) / schedulesPrevMonth) * 100
          )
        : null;

    // Montar alertas
    const alerts: { type: "warning" | "info" | "success"; message: string }[] = [];

    if (pendingConfirmations > 3) {
      alerts.push({ type: "warning", message: `${pendingConfirmations} confirmações pendentes nas próximas escalas` });
    }
    if (membersWithoutServing.length > 0) {
      alerts.push({ type: "warning", message: `${membersWithoutServing.length} membro${membersWithoutServing.length > 1 ? "s" : ""} sem participar há 30 dias` });
    }
    if (overloaded) {
      alerts.push({ type: "warning", message: `${overloaded.name} está em ${overloaded.count} escalas — considere diversificar` });
    }
    if (songsUnused6M.length > 0) {
      alerts.push({ type: "info", message: `${songsUnused6M.length} música${songsUnused6M.length > 1 ? "s" : ""} sem uso há 6 meses` });
    }
    if (songsNewMonth > 0) {
      alerts.push({ type: "success", message: `${songsNewMonth} música${songsNewMonth > 1 ? "s novas" : " nova"} adicionada${songsNewMonth > 1 ? "s" : ""} este mês` });
    }
    if (coachEnabled < totalMembers && coachEnabled > 0) {
      const sem = totalMembers - coachEnabled;
      alerts.push({ type: "info", message: `${sem} membro${sem > 1 ? "s" : ""} ainda sem acesso ao Professor IA` });
    }

    return NextResponse.json({
      alerts,
      team: {
        total: totalMembers,
        withoutServing: membersWithoutServing.map((m) => m.name),
        topLoad: topMembersLoad,
        overloaded,
      },
      repertoire: {
        total: totalSongs,
        newThisMonth: songsNewMonth,
        unusedSixMonths: songsUnused6M.map((s) => s.title),
      },
      schedules: {
        thisMonth: schedulesThisMonth,
        prevMonth: schedulesPrevMonth,
        trend: schedulesTrend,
        byMonth: schedulesByMonth,
        pendingConfirmations,
      },
      coach: {
        enabled: coachEnabled,
        total: coachProfiles.length,
        avgLevel,
        practicesThisMonth: practiceSubmissionsMonth,
      },
    });
  } catch (error) {
    console.error("[dashboard/insights] error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
