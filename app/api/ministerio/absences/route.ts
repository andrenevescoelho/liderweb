export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!["SUPERADMIN", "ADMIN", "LEADER"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const absences = await prisma.$queryRaw<any[]>`
      SELECT 
        sr.id,
        sr."declineReason",
        sr."declineNote",
        sr.role as "roleName",
        u.name as "memberName",
        u.id as "memberId",
        s.date as "scheduleDate",
        s.name as "scheduleName"
      FROM "ScheduleRole" sr
      JOIN "User" u ON u.id = sr."memberId"
      JOIN "Schedule" s ON s.id = sr."scheduleId"
      WHERE s."groupId" = ${user.groupId}
      AND sr.status = 'DECLINED'
      AND sr."declineReason" IS NOT NULL
      AND s.date >= ${thirtyDaysAgo}
      ORDER BY s.date DESC
      LIMIT 50
    `;

    return NextResponse.json(absences);
  } catch (e) {
    console.error("Absences error:", e);
    return NextResponse.json({ error: "Erro ao buscar ausências" }, { status: 500 });
  }
}
