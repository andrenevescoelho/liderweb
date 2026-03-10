export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { findScheduleAvailabilityConflicts } from "@/lib/schedule-availability";

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
            member: {
              include: { profile: true },
            },
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
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { date, roles, setlistItems } = body ?? {};

    await prisma.scheduleRole.deleteMany({
      where: { scheduleId: params?.id },
    });

    // Criar data ao meio-dia para evitar problemas de timezone
    let scheduleDate: Date | undefined;
    if (date) {
      const [year, month, day] = date.split("-").map(Number);
      scheduleDate = new Date(year, month - 1, day, 12, 0, 0);
    }

    const assignedRoles = (roles ?? []).filter((role: any) => role?.memberId);
    const assignedMemberIds = [...new Set(assignedRoles.map((role: any) => String(role.memberId)))];

    if (scheduleDate && assignedMemberIds.length > 0) {
      const membersRaw = await prisma.user.findMany({
        where: { id: { in: assignedMemberIds as string[] } },
        select: {
          id: true,
          name: true,
          profile: {
            select: { availability: true },
          },
        },
      }) as any[];

      const members = membersRaw.map((m: any) => ({
        id: m.id,
        name: m.name,
        profile: m.profile ? { availability: m.profile.availability as string[] } : null,
      }));

      const conflicts = findScheduleAvailabilityConflicts({
        date: scheduleDate,
        roles: assignedRoles,
        members,
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: "Há membros escalados em dias sem disponibilidade.",
            conflicts,
          },
          { status: 400 }
        );
      }
    }

    const existingSchedule = await prisma.schedule.findUnique({
      where: { id: params?.id },
      select: { setlistId: true },
    });

    let setlistId = existingSchedule?.setlistId ?? null;

    if (setlistId) {
      await prisma.setlistItem.deleteMany({ where: { setlistId } });
      await prisma.setlist.update({
        where: { id: setlistId },
        data: {
          name: date ? `Escala ${date}` : undefined,
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
          name: date ? `Escala ${date}` : "Escala",
          date: scheduleDate ?? new Date(),
          groupId: (session?.user as any)?.groupId ?? null,
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
            member: {
              include: { profile: true },
            },
          },
        },
      },
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
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await prisma.schedule.delete({
      where: { id: params?.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete schedule error:", error);
    return NextResponse.json({ error: "Erro ao excluir escala" }, { status: 500 });
  }
}
