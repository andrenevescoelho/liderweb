export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const db = prisma as any;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { status, justification, memberId } = await req.json();

    const targetMemberId =
      user.role === "SUPERADMIN" || user.role === "ADMIN" || user.role === "LEADER"
        ? memberId || user.id
        : user.id;

    const attendance = await db.rehearsalAttendance.upsert({
      where: {
        rehearsalId_memberId: {
          rehearsalId: params.id,
          memberId: targetMemberId,
        },
      },
      create: {
        rehearsalId: params.id,
        memberId: targetMemberId,
        status: status || "PENDING",
        justification: justification || null,
      },
      update: {
        status: status || "PENDING",
        justification: justification || null,
      },
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Attendance error:", error);
    return NextResponse.json({ error: "Erro ao confirmar presença" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  return POST(req, ctx);
}
