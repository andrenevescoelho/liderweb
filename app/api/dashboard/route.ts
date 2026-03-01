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

      const systemHealthDetails = [
        ...riskSubscriptions.map((subscription) => ({
          id: subscription.id,
          category: "Falha de pagamento",
          entity: subscription.group?.name ?? "Igreja sem nome",
          status: subscription.status,
          severity: "ALTA",
          detail: subscription.cancelAtPeriodEnd
            ? "Assinatura marcada para cancelamento no fim do período"
            : "Assinatura em situação de risco financeiro",
        })),
        ...lowActivityGroups.map((group) => ({
          id: group.id,
          category: "Baixa atividade",
          entity: group.name,
          status: "INATIVA_30_DIAS",
          severity: "MÉDIA",
          detail: "Sem escalas criadas nos últimos 30 dias",
        })),
      ];

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
            systemErrors: riskSubscriptions.length + canceledThisMonth,
            systemHealthDetails,
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
      ? await (async () => {
          const weekAhead = toDate(7);
          const sixMonthsAgo = toDate(-180);

          const [
            totalActiveMembers,
            totalInactiveMembers,
            weeklySchedules,
            confirmedInWeek,
            unconfirmedInWeek,
            absenceAlerts,
            memberLoad,
            membersWithoutServing,
            schedulesCreatedMonth,
            roleDistribution,
            songsMostUsed,
            songsNewMonth,
            songsUnused6M,
            keyUsage,
            bpmSamples,
            frequencyByInstrument,
            attendanceHistory,
            schedulesByMonth,
            activeProfiles,
            nextThreeSchedules,
          ] = await Promise.all([
            prisma.user.count({ where: { ...memberWhere, profile: { is: { active: true } } } }),
            prisma.user.count({ where: { ...memberWhere, OR: [{ profile: { is: null } }, { profile: { is: { active: false } } }] } }),
            prisma.schedule.findMany({
              where: { ...(groupId && { groupId }), date: { gte: now, lte: weekAhead } },
              include: { setlist: true, roles: true },
              orderBy: { date: "asc" },
              take: 5,
            }),
            prisma.scheduleRole.count({
              where: { schedule: { ...(groupId && { groupId }), date: { gte: now, lte: weekAhead } }, status: "ACCEPTED" },
            }),
            prisma.scheduleRole.count({
              where: {
                schedule: { ...(groupId && { groupId }), date: { gte: now, lte: weekAhead } },
                status: { in: ["PENDING", "DECLINED"] },
              },
            }),
            prisma.scheduleRole.count({
              where: { schedule: { ...(groupId && { groupId }), date: { gte: now, lte: weekAhead } }, status: "DECLINED" },
            }),
            prisma.scheduleRole.groupBy({
              by: ["memberId"],
              where: { schedule: { ...(groupId && { groupId }), date: { gte: sixMonthsAgo } }, memberId: { not: null } },
              _count: { _all: true },
            }),
            prisma.user.findMany({
              where: { ...memberWhere, profile: { is: { active: true } }, scheduleRoles: { none: { schedule: { date: { gte: toDate(-60) } } } } },
              select: { id: true, name: true },
              take: 5,
            }),
            prisma.schedule.count({ where: { ...(groupId && { groupId }), createdAt: { gte: monthStart } } }),
            prisma.scheduleRole.groupBy({
              by: ["memberId"],
              where: { schedule: { ...(groupId && { groupId }), date: { gte: monthStart } }, memberId: { not: null } },
              _count: { _all: true },
            }),
            prisma.setlistItem.findMany({
              where: { setlist: { ...(groupId && { groupId }), schedules: { some: { date: { gte: sixMonthsAgo } } } } },
              include: { song: true },
            }),
            prisma.song.count({ where: { ...songWhere, createdAt: { gte: monthStart } } }),
            prisma.song.findMany({
              where: { ...songWhere, setlistItems: { none: { setlist: { schedules: { some: { date: { gte: sixMonthsAgo } } } } } } },
              select: { id: true, title: true },
              take: 5,
            }),
            prisma.setlistItem.groupBy({
              by: ["selectedKey"],
              where: { setlist: { ...(groupId && { groupId }), schedules: { some: { date: { gte: sixMonthsAgo } } } } },
              _count: { _all: true },
            }),
            prisma.setlistItem.findMany({
              where: { setlist: { ...(groupId && { groupId }), schedules: { some: { date: { gte: monthStart } } } }, song: { bpm: { not: null } } },
              include: { song: { select: { bpm: true } } },
            }),
            prisma.scheduleRole.groupBy({
              by: ["role"],
              where: { schedule: { ...(groupId && { groupId }), date: { gte: monthStart } } },
              _count: { _all: true },
            }),
            prisma.scheduleRole.groupBy({
              by: ["status"],
              where: { schedule: { ...(groupId && { groupId }), date: { gte: toDate(-60) } } },
              _count: { _all: true },
            }),
            Promise.all(
              Array.from({ length: 6 }).map(async (_, index) => {
                const start = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
                const end = new Date(now.getFullYear(), now.getMonth() - (4 - index), 1);
                const count = await prisma.schedule.count({ where: { ...(groupId && { groupId }), createdAt: { gte: start, lt: end } } });
                return { month: start.toLocaleDateString("pt-BR", { month: "short" }), count };
              })
            ),
            prisma.memberProfile.findMany({
              where: { user: { ...(groupId && { groupId }), role: { not: "SUPERADMIN" } }, active: true },
              select: { instruments: true },
            }),
            prisma.schedule.findMany({
              where: { ...(groupId && { groupId }), date: { gte: now } },
              include: { roles: true },
              orderBy: { date: "asc" },
              take: 3,
            }),
          ]);

          const memberCountMap = new Map(memberLoad.map((item) => [item.memberId, item._count._all]));
          const memberNames = await prisma.user.findMany({
            where: { id: { in: Array.from(memberCountMap.keys()).filter(Boolean) as string[] } },
            select: { id: true, name: true },
          });
          const topMembers = memberNames
            .map((member) => ({ name: member.name, value: memberCountMap.get(member.id) ?? 0 }))
            .sort((a, b) => b.value - a.value);

          const distributionValues = roleDistribution.map((item) => item._count._all);
          const distributionMin = distributionValues.length ? Math.min(...distributionValues) : 0;
          const distributionMax = distributionValues.length ? Math.max(...distributionValues) : 0;

          const songCounter = songsMostUsed.reduce((acc: Record<string, { title: string; uses: number }>, item) => {
            if (!item.song) return acc;
            const key = item.song.id;
            acc[key] = acc[key] ?? { title: item.song.title, uses: 0 };
            acc[key].uses += 1;
            return acc;
          }, {});

          const songsRanking = Object.values(songCounter).sort((a, b) => b.uses - a.uses);
          const topKey = keyUsage.sort((a, b) => b._count._all - a._count._all)[0]?.selectedKey ?? "N/A";
          const avgBpm = bpmSamples.length > 0
            ? bpmSamples.reduce((acc, item) => acc + (item.song?.bpm ?? 0), 0) / bpmSamples.length
            : 0;

          const instrumentCounter = activeProfiles.reduce((acc: Record<string, number>, profile) => {
            profile.instruments.forEach((instrument) => {
              acc[instrument] = (acc[instrument] ?? 0) + 1;
            });
            return acc;
          }, {});

          const instrumentsWithShortage = Object.entries(instrumentCounter)
            .filter(([, total]) => total <= 1)
            .map(([instrument, total]) => ({ instrument, total }))
            .slice(0, 5);

          const nextThreeGuitarists = new Set(
            nextThreeSchedules.flatMap((schedule) =>
              schedule.roles
                .filter((role) => /guit|guitar/i.test(role.role) && !!role.memberId)
                .map((role) => role.memberId as string)
            )
          ).size;

          const overloadShare = topMembers.length > 0
            ? (topMembers.slice(0, 5).reduce((acc, item) => acc + item.value, 0) /
                Math.max(1, topMembers.reduce((acc, item) => acc + item.value, 0))) * 100
            : 0;

          const attendanceSummary = attendanceHistory.reduce((acc: Record<string, number>, item) => {
            acc[item.status] = item._count._all;
            return acc;
          }, {});

          return {
            nextSchedule: upcomingSchedules?.[0] ?? null,
            pendingTasks: pendingConfirmations.length,
            confirmationRate: totalInvitesCurrentMonth > 0 ? (confirmationsCurrentMonth / totalInvitesCurrentMonth) * 100 : 0,
            frequencyChart: [
              { label: "Mês passado", value: setlistsPreviousMonth },
              { label: "Mês atual", value: setlistsCurrentMonth },
            ],
            quickWeek: {
              nextWorship: weeklySchedules?.[0] ?? null,
              weekSchedules: weeklySchedules.length,
              confirmedInWeek,
              unconfirmedInWeek,
              absenceAlerts,
            },
            members: {
              totalMembers,
              activeMembers: totalActiveMembers,
              inactiveMembers: totalInactiveMembers,
              topScaled: topMembers.slice(0, 5),
              withoutServing: membersWithoutServing,
            },
            schedules: {
              createdInMonth: schedulesCreatedMonth,
              participationDistribution: roleDistribution.map((item) => ({ memberId: item.memberId, count: item._count._all })),
              musicianBalance: distributionMin > 0 ? Number((distributionMax / distributionMin).toFixed(2)) : null,
              instrumentsWithShortage,
              strongInsight: `Você tem apenas ${nextThreeGuitarists} guitarrista(s) disponível(is) nos próximos 3 cultos.`,
            },
            repertoire: {
              mostUsedSongs: songsRanking.slice(0, 5),
              newSongsInMonth: songsNewMonth,
              songsUnusedSixMonths: songsUnused6M,
              topKey,
              avgBpm: Number(avgBpm.toFixed(1)),
            },
            reports: {
              individualFrequency: topMembers.slice(0, 10),
              frequencyByInstrument: frequencyByInstrument.map((item) => ({ role: item.role, count: item._count._all })),
              participationByPeriod: {
                manha: weeklySchedules.filter((s) => new Date(s.date).getHours() < 12).length,
                tarde: weeklySchedules.filter((s) => {
                  const h = new Date(s.date).getHours();
                  return h >= 12 && h < 18;
                }).length,
                noite: weeklySchedules.filter((s) => new Date(s.date).getHours() >= 18).length,
              },
              schedulesByMonth,
              attendanceHistory: attendanceSummary,
            },
            smartIndicators: {
              overloadedMinistry: overloadShare > 60,
              repeatedMembers: (topMembers[0]?.value ?? 0) > Math.max(3, (topMembers[1]?.value ?? 0) * 1.8),
              lowDiversity: instrumentsWithShortage.length > 0,
              highAbsenceMember: (attendanceSummary.DECLINED ?? 0) > (attendanceSummary.ACCEPTED ?? 0) * 0.35,
            },
            aiFuture: {
              audioTechAssessment: "Em breve",
              ministryAverageLevel: "Em breve",
              repertoireSuggestionByLevel: "Em breve",
              balancedAutoScaleSuggestion: "Em breve",
            },
            automaticAlerts: {
              lowActivity: setlistsCurrentMonth === 0,
              manyPendingConfirmations: pendingConfirmations.length >= 5,
            },
          };
        })()
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
