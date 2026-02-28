export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

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
    const canAccessGroupReports =
      userRole === "ADMIN" ||
      userRole === "LEADER" ||
      hasPermission(userRole, "report.group.access", userPermissions) ||
      hasPermission(userRole, "report.minister.stats", userPermissions);

    // SuperAdmin vê estatísticas gerais
    if (userRole === "SUPERADMIN") {
      const totalGroups = await prisma.group.count();
      const totalMembers = await prisma.user.count({ where: { role: { not: "SUPERADMIN" } } });
      const totalSongs = await prisma.song.count();
      const totalSetlists = await prisma.setlist.count();

      return NextResponse.json({
        upcomingSchedules: [],
        myUpcomingSchedules: [],
        pendingConfirmations: [],
        songsToRehearse: [],
        stats: {
          totalGroups,
          totalMembers,
          totalSongs,
          totalSetlists,
        },
      });
    }

    // Buscar escalas onde o usuário ESTÁ ESCALADO
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

    // Extrair escalas únicas onde o usuário está escalado
    const myUpcomingSchedules = myScheduleRoles.map((sr) => ({
      ...sr.schedule,
      myRole: sr.role,
      myStatus: sr.status,
      roleId: sr.id,
    }));

    // Extrair músicas para ensaiar (de todas as escalas futuras do usuário)
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

    // Para Admin/Leader: buscar todas as próximas escalas do grupo
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

    // Pendências
    let pendingConfirmations: any[] = [];
    if (canAccessGroupReports) {
      // Admin/Leader vê todas as pendências do grupo
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
      // Membros veem apenas suas próprias pendências
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

    // Estatísticas do grupo
    const memberWhere: any = groupId ? { groupId } : {};
    memberWhere.role = { not: "SUPERADMIN" };
    const songWhere: any = groupId ? { groupId } : {};
    const setlistWhere: any = groupId ? { groupId } : {};

    const totalMembers = await prisma.user.count({ where: memberWhere });
    const totalSongs = await prisma.song.count({ where: songWhere });
    const totalSetlists = await prisma.setlist.count({ where: setlistWhere });

    return NextResponse.json({
      upcomingSchedules: upcomingSchedules ?? [],
      myUpcomingSchedules: myUpcomingSchedules ?? [],
      pendingConfirmations: pendingConfirmations ?? [],
      songsToRehearse: songsToRehearse ?? [],
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
