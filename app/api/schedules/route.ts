export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const searchParams = req?.nextUrl?.searchParams;
    const month = searchParams?.get?.("month");
    const year = searchParams?.get?.("year");

    const where: any = {};
    const canViewAllSchedules =
      user.role === "SUPERADMIN" ||
      user.role === "ADMIN" ||
      user.role === "LEADER" ||
      hasPermission(user.role, "schedule.view.all", user.permissions);

    // SuperAdmin vê todos, outros veem apenas do seu grupo
    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) {
        return NextResponse.json([]);
      }
      where.groupId = user.groupId;

      if (!canViewAllSchedules && user.id) {
        where.roles = {
          some: {
            memberId: user.id,
          },
        };
      }
    }

    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        setlist: {
          include: {
            items: {
              include: { song: true },
              orderBy: { order: "asc" },
            },
          },
        },
        roles: {
          include: {
            member: {
              include: { profile: true },
            },
          },
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(schedules ?? []);
  } catch (error) {
    console.error("Get schedules error:", error);
    return NextResponse.json({ error: "Erro ao buscar escalas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userRole = user?.role ?? "MEMBER";

    if (!session || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canCreateSchedule =
      userRole === "SUPERADMIN" ||
      userRole === "ADMIN" ||
      userRole === "LEADER" ||
      hasPermission(userRole, "schedule.create", user?.permissions);

    if (!canCreateSchedule) {
      return NextResponse.json({ error: "Sem permissão para criar escalas" }, { status: 403 });
    }

    if (userRole !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Usuário não pertence a nenhum grupo" }, { status: 400 });
    }

    const body = await req.json();
    const { date, roles, setlistItems } = body ?? {};

    if (!date) {
      return NextResponse.json({ error: "Data é obrigatória" }, { status: 400 });
    }

    // Criar data ao meio-dia para evitar problemas de timezone
    const [year, month, day] = date.split("-").map(Number);
    const scheduleDate = new Date(year, month - 1, day, 12, 0, 0);

    const createdSetlist = await prisma.setlist.create({
      data: {
        name: `Escala ${date}`,
        date: scheduleDate,
        groupId: user.groupId ?? null,
        items: {
          create: (setlistItems ?? []).map((item: any, index: number) => ({
            songId: item?.songId,
            selectedKey: item?.selectedKey ?? "C",
            order: index,
          })),
        },
      },
    });

    const schedule = await prisma.schedule.create({
      data: {
        date: scheduleDate,
        setlistId: createdSetlist.id,
        groupId: user.groupId ?? null,
        roles: {
          create: (roles ?? [])?.map?.((r: any) => ({
            role: r?.role,
            memberId: r?.memberId ?? null,
            status: r?.status ?? "PENDING",
          })),
        },
      },
      include: {
        setlist: {
          include: {
            items: {
              include: { song: true },
              orderBy: { order: "asc" },
            },
          },
        },
        roles: {
          include: {
            member: {
              include: { profile: true },
            },
          },
        },
      },
    });

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Create schedule error:", error);
    return NextResponse.json({ error: "Erro ao criar escala" }, { status: 500 });
  }
}
