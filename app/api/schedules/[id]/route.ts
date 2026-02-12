export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

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
    const { date, setlistId, roles } = body ?? {};

    await prisma.scheduleRole.deleteMany({
      where: { scheduleId: params?.id },
    });

    // Criar data ao meio-dia para evitar problemas de timezone
    let scheduleDate: Date | undefined;
    if (date) {
      const [year, month, day] = date.split("-").map(Number);
      scheduleDate = new Date(year, month - 1, day, 12, 0, 0);
    }

    const schedule = await prisma.schedule.update({
      where: { id: params?.id },
      data: {
        date: scheduleDate,
        setlistId: setlistId ?? null,
        roles: {
          create: (roles ?? [])?.map?.((r: any) => ({
            role: r?.role,
            memberId: r?.memberId ?? null,
            status: r?.status ?? "PENDING",
          })),
        },
      },
      include: {
        setlist: true,
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
