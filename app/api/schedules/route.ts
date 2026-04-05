export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { findScheduleAvailabilityConflicts } from "@/lib/schedule-availability";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

/**
 * Monta DateTime a partir de date ("2025-04-06") e time opcional ("17:00").
 * Se time não vier, usa 12:00 como fallback (compatibilidade com dados antigos).
 */
function buildScheduleDate(date: string, time?: string | null): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0);
  }
  return new Date(year, month - 1, day, 12, 0, 0);
}

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

    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) return NextResponse.json([]);
      where.groupId = user.groupId;

      if (!canViewAllSchedules && user.id) {
        where.roles = { some: { memberId: user.id } };
      }
    }

    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        setlist: {
          include: {
            items: { include: { song: true }, orderBy: { order: "asc" } },
          },
        },
        roles: {
          include: { member: { include: { profile: true } } },
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
    const context = extractRequestContext(req);

    // name: nome do culto ex: "Culto da Manhã", "Escola Dominical"
    // time: horário "HH:MM" ex: "09:00", "17:00", "19:00"
    const { date, time, name, roles, setlistItems } = body ?? {};

    if (!date) {
      return NextResponse.json({ error: "Data é obrigatória" }, { status: 400 });
    }

    const scheduleDate = buildScheduleDate(date, time);

    // Verificar conflitos de disponibilidade
    const assignedRoles = (roles ?? []).filter((role: any) => role?.memberId);
    const assignedMemberIds = [...new Set(assignedRoles.map((role: any) => String(role.memberId)))];

    if (assignedMemberIds.length > 0) {
      const members = await prisma.user.findMany({
        where: { id: { in: assignedMemberIds } },
        select: {
          id: true,
          name: true,
          profile: { select: { availability: true } },
        },
      });

      const conflicts = findScheduleAvailabilityConflicts({
        date: scheduleDate,
        roles: assignedRoles,
        members,
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: "Há membros escalados em dias sem disponibilidade.", conflicts },
          { status: 400 }
        );
      }
    }

    const scheduleName = name?.trim() || null;
    const setlistName = scheduleName ?? (time ? `Escala ${date} ${time}` : `Escala ${date}`);

    const createdSetlist = await prisma.setlist.create({
      data: {
        name: setlistName,
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
        name: scheduleName,
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
            items: { include: { song: true }, orderBy: { order: "asc" } },
          },
        },
        roles: {
          include: { member: { include: { profile: true } } },
        },
      },
    });

    const displayName = scheduleName ?? setlistName;

    await logUserAction({
      userId: user.id,
      groupId: user.groupId ?? null,
      action: AUDIT_ACTIONS.SCALE_CREATED,
      entityType: AuditEntityType.SCALE,
      entityId: schedule.id,
      entityName: displayName,
      description: `Usuário ${user.name} criou uma nova escala`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: {
        date, time, name: scheduleName,
        rolesCount: (roles ?? []).length,
        setlistItemsCount: (setlistItems ?? []).length,
      },
    });

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Create schedule error:", error);
    return NextResponse.json({ error: "Erro ao criar escala" }, { status: 500 });
  }
}
