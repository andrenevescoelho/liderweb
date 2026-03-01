export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const db = prisma as any;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (user.role !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Sem grupo selecionado" }, { status: 403 });
    }

    if (!db?.rehearsal?.findFirst) {
      return NextResponse.json({ error: "Módulo de ensaios indisponível no momento" }, { status: 503 });
    }

    const nextRehearsal = await db.rehearsal.findFirst({
      where: {
        status: "PUBLISHED",
        dateTime: { gte: new Date() },
        ...(user.role === "SUPERADMIN" ? {} : { groupId: user.groupId }),
      },
      orderBy: { dateTime: "asc" },
      select: {
        id: true,
        dateTime: true,
        location: true,
        status: true,
        attendance: {
          where: { memberId: user.id },
          select: { status: true },
          take: 1,
        },
      },
    });

    if (!nextRehearsal) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      id: nextRehearsal.id,
      dateTime: nextRehearsal.dateTime,
      location: nextRehearsal.location,
      status: nextRehearsal.status,
      attendanceStatus: nextRehearsal.attendance?.[0]?.status ?? "PENDING",
    });
  } catch (error) {
    console.error("Get next rehearsal error:", error);
    return NextResponse.json({ error: "Erro ao buscar próximo ensaio" }, { status: 500 });
  }
}
