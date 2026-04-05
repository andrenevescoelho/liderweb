export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { findScheduleAvailabilityConflicts } from "@/lib/schedule-availability";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

function buildScheduleDate(date: string, time?: string | null): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [hour, minute] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute, 0);
  }
  return new Date(year, month - 1, day, 12, 0, 0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: params?.id },
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
            member: { include: { profile: true } },
          },
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Get schedule error:", error);
    return NextResponse.json({ error: "Erro ao buscar escala" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userRole = user?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const context = extractRequestContext(req);

    const before = await prisma.schedule.findUnique({
      where: { id: params?.id },
      include: { roles: true, setlist: { include: { items: true } } },
    });

    if (!before) {
      return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
    }

    const { date, time, name, roles, setlistItems } = body ?? {};

    await prisma.scheduleRole.deleteMany({ where: { scheduleId: params?.id } });

    let scheduleDate: Date | undefined;
    if (date) {
      scheduleDate = buildScheduleDate(date, time);
    }

    const assignedRoles = (roles ?? []).filter((role: any) => role?.memberId);
    const assignedMemberIds = [...new Set(assignedRoles.map((role: any) => String(role.memberId)))];

    if (scheduleDate && assignedMemberIds.length > 0) {
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

    const existingSchedule = await prisma.schedule.findUnique({
      where: { id: params?.id },
      select: { setlistId: true },
    });

    let setlistId = existingSchedule?.setlistId ?? null;

    const scheduleLabel = name?.trim()
      ? name.trim()
      : time && date
        ? `Escala ${date} ${time}`
        : date
          ? `Escala ${date}`
          : undefined;

    if (setlistId) {
      await prisma.setlistItem.deleteMany({ where: { setlistId } });
      await prisma.setlist.update({
        where: { id: setlistId },
        data: {
          name: scheduleLabel,
          date: scheduleDate,
          items: {
            create: (setlistItems ?? []).map((item: any, index: number) => ({
              songId: item?.songId,
              selectedKey: item?.selectedKey ?? "C",
              order: index,
            })),
          },
        },
      });
    } else {
      const newSetlist = await prisma.setlist.create({
        data: {
          name: scheduleLabel ?? "Escala",
          date: scheduleDate ?? new Date(),
          groupId: user?.groupId ?? null,
          items: {
            create: (setlistItems ?? []).map((item: any, index: number) => ({
              songId: item?.songId,
              selectedKey: item?.selectedKey ?? "C",
              order: index,
            })),
          },
        },
      });
      setlistId = newSetlist.id;
    }

    const schedule = await prisma.schedule.update({
      where: { id: params?.id },
      data: {
        date: scheduleDate,
        time: time ?? null,
        name: name?.trim() ?? null,
        setlistId,
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
            member: { include: { profile: true } },
          },
        },
      },
    });

    const displayName = schedule.name
      ?? (schedule.time ? `Escala ${schedule.date.toISOString().slice(0, 10)} ${schedule.time}` : `Escala ${schedule.date.toISOString().slice(0, 10)}`);

    await logUserAction({
      userId: user?.id,
      groupId: schedule.groupId ?? user?.groupId ?? null,
      action: AUDIT_ACTIONS.SCALE_UPDATED,
      entityType: AuditEntityType.SCALE,
      entityId: schedule.id,
      entityName: displayName,
      description: "Escala atualizada",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { date: before.date, rolesCount: before.roles.length, setlistItemsCount: before.setlist?.items?.length ?? 0 },
      newValues: { date: schedule.date, rolesCount: schedule.roles.length, setlistItemsCount: schedule.setlist?.items?.length ?? 0 },
    });

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Update schedule error:", error);
    return NextResponse.json({ error: "Erro ao atualizar escala" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userRole = user?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const context = extractRequestContext(req);
    const before = await prisma.schedule.findUnique({ where: { id: params?.id } });
    if (!before) return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });

    await prisma.schedule.delete({ where: { id: params?.id } });

    const displayName = before.name
      ?? (before.time ? `Escala ${before.date.toISOString().slice(0, 10)} ${before.time}` : `Escala ${before.date.toISOString().slice(0, 10)}`);

    await logUserAction({
      userId: user?.id,
      groupId: before.groupId ?? user?.groupId ?? null,
      action: AUDIT_ACTIONS.SCALE_DELETED,
      entityType: AuditEntityType.SCALE,
      entityId: before.id,
      entityName: displayName,
      description: "Escala removida",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { date: before.date },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete schedule error:", error);
    return NextResponse.json({ error: "Erro ao excluir escala" }, { status: 500 });
  }
}
