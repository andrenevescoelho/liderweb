export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_IN_MS);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const userId = user?.id;
    const userRole = user?.role;
    const userPermissions = (user?.permissions ?? []) as string[];
    const groupId = user?.groupId;
    const now = new Date();
    const thirtyDaysAgo = toDate(-30);
    const sixtyDaysAgo = toDate(-60);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const canAccessGroupReports =
      userRole === "ADMIN" ||
      userRole === "LEADER" ||
      hasPermission(userRole, "report.group.access", userPermissions) ||
      hasPermission(userRole, "report.minister.stats", userPermissions);

    // SuperAdmin vê estatísticas estratégicas
    if (userRole === "SUPERADMIN") {
      const [
        totalGroups,
        totalMinistries,
        totalMembers,
        totalSongs,
        totalSetlists,
        activeSubscriptions,
        trialSubscriptions,
        canceledThisMonth,
        lowActivityGroups,
        riskSubscriptions,
      ] = await Promise.all([
        prisma.group.count(),
        prisma.group.count(),
        prisma.user.count({ where: { role: { not: "SUPERADMIN" } } }),
        prisma.song.count(),
        prisma.setlist.count(),
        prisma.subscription.findMany({ where: { status: "ACTIVE" }, include: { plan: true } }),
        prisma.subscription.findMany({ where: { status: "TRIALING" }, include: { plan: true } }),
        prisma.subscription.count({
          where: {
            status: "CANCELED",
            updatedAt: { gte: monthStart },
          },
        }),
        prisma.group.findMany({
          where: {
            schedules: {
              none: {
                date: { gte: thirtyDaysAgo },
              },
            },
          },
          select: { id: true, name: true },
          take: 5,
        }),
        prisma.subscription.findMany({
          where: {
            OR: [{ status: "PAST_DUE" }, { status: "UNPAID" }, { cancelAtPeriodEnd: true }],
          },
          include: { group: { select: { id: true, name: true } } },
          take: 5,
        }),
      ]);

      const paidSubscriptions = activeSubscriptions.length;
      const mrr = activeSubscriptions.reduce((acc, subscription) => acc + (subscription.plan?.price ?? 0), 0);
      const churn = paidSubscriptions > 0 ? (canceledThisMonth / paidSubscriptions) * 100 : 0;

      const allSubscriptions = [...activeSubscriptions, ...trialSubscriptions];
      const plansCounter = allSubscriptions.reduce((acc: Record<string, number>, subscription) => {
        const key = subscription.plan?.name ?? "Plano não informado";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const topPlan = Object.entries(plansCounter).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";

      const monthlyGrowth = await Promise.all(
        Array.from({ length: 6 }).map(async (_, index) => {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
          const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - (4 - index), 1);

          const [newGroups, setlistsCreated] = await Promise.all([
            prisma.group.count({
              where: {
                createdAt: { gte: monthDate, lt: nextMonthDate },
              },
            }),
            prisma.setlist.count({
              where: {
                createdAt: { gte: monthDate, lt: nextMonthDate },
              },
            }),
          ]);

          return {
            month: monthDate.toLocaleDateString("pt-BR", { month: "short" }),
            newGroups,
            setlistsCreated,
          };
        })
      );

      const schedulesByGroup = await prisma.group.findMany({
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              schedules: {
                where: { date: { gte: thirtyDaysAgo } },
              },
            },
          },
        },
        orderBy: {
          schedules: {
            _count: "desc",
          },
        },
        take: 8,
      });

      const uploadsMultitracks = await prisma.attachment.count({
        where: {
          OR: [
            { fileType: { contains: "audio", mode: "insensitive" } },
            { fileName: { contains: "multitrack", mode: "insensitive" } },
          ],
        },
      });

      const materialsPublished = await prisma.attachment.count({ where: { isPublic: true } });

      const activeMembersByScale = await prisma.scheduleRole.findMany({
        where: {
          schedule: {
            date: { gte: thirtyDaysAgo },
          },
          memberId: { not: null },
        },
        select: { memberId: true },
      });

      const activeMembersIn30d = new Set(activeMembersByScale.map((item) => item.memberId).filter(Boolean)).size;

      const acceptedIn30d = await prisma.scheduleRole.count({
        where: {
          status: "ACCEPTED",
          schedule: { date: { gte: thirtyDaysAgo } },
        },
      });

      const totalInvitesIn30d = await prisma.scheduleRole.count({
        where: {
          schedule: { date: { gte: thirtyDaysAgo } },
        },
      });

      const frequencyCurrentMonth = await prisma.scheduleRole.groupBy({
        by: ["scheduleId"],
        where: {
          schedule: {
            date: { gte: monthStart },
          },
        },
        _count: { _all: true },
      });

      const avgMembersPerSchedule =
        frequencyCurrentMonth.length > 0
          ? frequencyCurrentMonth.reduce((acc, item) => acc + item._count._all, 0) / frequencyCurrentMonth.length
          : 0;

      const schedulesLast30 = await prisma.schedule.count({ where: { date: { gte: thirtyDaysAgo } } });
      const schedulesPrev30 = await prisma.schedule.count({
        where: {
          date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      });

      const engagementDrop = schedulesPrev30 > 0 ? ((schedulesPrev30 - schedulesLast30) / schedulesPrev30) * 100 : 0;

      return NextResponse.json({
        groupName: null,
        upcomingSchedules: [],
        myUpcomingSchedules: [],
        pendingConfirmations: [],
        songsToRehearse: [],
        stats: {
          totalGroups,
          totalMembers,
          totalSongs,
          totalSetlists,
          totalMinistries,
          mrr,
          activeChurches: paidSubscriptions,
          trialChurches: trialSubscriptions.length,
          churn,
          topPlan,
          activeMinistries30d: totalGroups - lowActivityGroups.length,
          inactiveMinistries: lowActivityGroups.length,
          newGroupsThisMonth: monthlyGrowth[5]?.newGroups ?? 0,
          setlistsInMonth: monthlyGrowth[5]?.setlistsCreated ?? 0,
          activeMembersIn30d,
          uploadsMultitracks,
          materialsPublished,
          confirmationsIn30d: acceptedIn30d,
          confirmationsRate: totalInvitesIn30d > 0 ? (acceptedIn30d / totalInvitesIn30d) * 100 : 0,
          avgMembersPerSchedule,
        },
        superadminInsights: {
          monthlyGrowth,
          schedulesByGroup: schedulesByGroup.map((group) => ({
            name: group.name,
            usage: group._count.schedules,
          })),
          mapDistribution: {
            "Sem região": totalGroups,
          },
          alerts: {
            lowActivityGroups,
            riskSubscriptions: riskSubscriptions.map((subscription) => ({
              id: subscription.id,
              groupName: subscription.group?.name ?? "Igreja sem nome",
              status: subscription.status,
            })),
            engagementDrop: Number(engagementDrop.toFixed(1)),
            paymentIssues: riskSubscriptions.length,
            systemErrors: 0,
          },
          aiSuggestions: {
            upgradePotential: Math.max(0, Math.floor(totalGroups * 0.15)),
            overloadedLeaders: Math.max(0, Math.floor(activeMembersIn30d * 0.08)),
            usagePattern: "Uso concentrado em agendas mensais e confirmação de escala",
            suggestedPlan: topPlan,
          },
        },
      });
    }

    const group = groupId
      ? await prisma.group.findUnique({
          where: { id: groupId },
          select: { name: true },
        })
      : null;

    const myScheduleRoles = await prisma.scheduleRole.findMany({
      where: {
        memberId: userId,
        schedule: {
          date: { gte: now },
          ...(groupId && { groupId }),
        },
      },
      include: {
        schedule: {
          include: {
            setlist: {
              include: {
                items: {
                  include: {
                    song: true,
                  },
                  orderBy: { order: "asc" },
                },
              },
            },
            roles: {
              include: {
                member: true,
              },
            },
          },
        },
      },
      orderBy: {
        schedule: {
          date: "asc",
        },
      },
    });

    const myUpcomingSchedules = myScheduleRoles.map((sr) => ({
      ...sr.schedule,
      myRole: sr.role,
      myStatus: sr.status,
      roleId: sr.id,
    }));

    const songsMap = new Map();
    myScheduleRoles.forEach((sr) => {
      const schedule = sr.schedule;
      const setlist = schedule.setlist;
      if (setlist?.items) {
        setlist.items.forEach((item: any) => {
          if (item.song && !songsMap.has(item.song.id)) {
            songsMap.set(item.song.id, {
              ...item.song,
              customKey: item.selectedKey,
              scheduleDate: schedule.date,
              setlistName: setlist.name,
            });
          }
        });
      }
    });
    const songsToRehearse = Array.from(songsMap.values());

    let upcomingSchedules: any[] = [];
    if (canAccessGroupReports) {
      const scheduleWhere: any = { date: { gte: now } };
      if (groupId) {
        scheduleWhere.groupId = groupId;
      }

      upcomingSchedules = await prisma.schedule.findMany({
        where: scheduleWhere,
        include: {
          setlist: true,
          roles: {
            include: {
              member: true,
            },
          },
        },
        orderBy: { date: "asc" },
        take: 5,
      });
    }

    let pendingConfirmations: any[] = [];
    if (canAccessGroupReports) {
      pendingConfirmations = await prisma.scheduleRole.findMany({
        where: {
          status: "PENDING",
          schedule: {
            date: { gte: now },
            ...(groupId && { groupId }),
          },
        },
        include: {
          schedule: true,
          member: true,
        },
        take: 10,
      });
    } else {
      pendingConfirmations = await prisma.scheduleRole.findMany({
        where: {
          memberId: userId,
          status: "PENDING",
          schedule: {
            date: { gte: now },
          },
        },
        include: {
          schedule: true,
        },
        take: 10,
      });
    }

    const memberWhere: any = groupId ? { groupId } : {};
    memberWhere.role = { not: "SUPERADMIN" };
    const songWhere: any = groupId ? { groupId } : {};
    const setlistWhere: any = groupId ? { groupId } : {};

    const [totalMembers, totalSongs, totalSetlists] = await Promise.all([
      prisma.user.count({ where: memberWhere }),
      prisma.song.count({ where: songWhere }),
      prisma.setlist.count({ where: setlistWhere }),
    ]);

    const [setlistsCurrentMonth, setlistsPreviousMonth, confirmationsCurrentMonth, totalInvitesCurrentMonth] = await Promise.all([
      prisma.setlist.count({
        where: {
          ...setlistWhere,
          createdAt: { gte: monthStart },
        },
      }),
      prisma.setlist.count({
        where: {
          ...setlistWhere,
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: monthStart },
        },
      }),
      prisma.scheduleRole.count({
        where: {
          schedule: {
            ...(groupId && { groupId }),
            date: { gte: monthStart },
          },
          status: "ACCEPTED",
        },
      }),
      prisma.scheduleRole.count({
        where: {
          schedule: {
            ...(groupId && { groupId }),
            date: { gte: monthStart },
          },
        },
      }),
    ]);

    const adminInsights = canAccessGroupReports
      ? {
          nextSchedule: upcomingSchedules?.[0] ?? null,
          pendingTasks: pendingConfirmations.length,
          frequencyChart: [
            { label: "Mês passado", value: setlistsPreviousMonth },
            { label: "Mês atual", value: setlistsCurrentMonth },
          ],
          confirmationRate: totalInvitesCurrentMonth > 0 ? (confirmationsCurrentMonth / totalInvitesCurrentMonth) * 100 : 0,
          automaticAlerts: {
            lowActivity: setlistsCurrentMonth === 0,
            manyPendingConfirmations: pendingConfirmations.length >= 5,
          },
        }
      : null;

    return NextResponse.json({
      groupName: group?.name ?? null,
      upcomingSchedules: upcomingSchedules ?? [],
      myUpcomingSchedules: myUpcomingSchedules ?? [],
      pendingConfirmations: pendingConfirmations ?? [],
      songsToRehearse: songsToRehearse ?? [],
      adminInsights,
      stats: {
        totalMembers,
        totalSongs,
        totalSetlists,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Erro ao carregar dashboard" }, { status: 500 });
  }
}
