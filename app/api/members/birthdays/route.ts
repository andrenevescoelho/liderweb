export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { SessionUser } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const searchParams = req.nextUrl.searchParams;
    const monthParam = Number.parseInt(searchParams.get("month") ?? "", 10);
    const month = Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
      ? monthParam
      : new Date().getMonth() + 1;

    const groupIdParam = searchParams.get("groupId");
    const scopedGroupId = user.role === "SUPERADMIN" ? groupIdParam : user.groupId;

    if (user.role !== "SUPERADMIN" && !scopedGroupId) {
      return NextResponse.json([]);
    }

    const whereGroup = scopedGroupId
      ? Prisma.sql`AND u."groupId" = ${scopedGroupId}`
      : Prisma.empty;

    const birthdays = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      birthDate: Date;
      memberFunction: string | null;
      leadershipRole: string | null;
      groupId: string | null;
      groupName: string | null;
    }>>(Prisma.sql`
      SELECT
        u."id",
        u."name",
        mp."birthDate",
        mp."memberFunction",
        mp."leadershipRole",
        u."groupId",
        g."name" AS "groupName"
      FROM "User" u
      INNER JOIN "MemberProfile" mp ON mp."userId" = u."id"
      LEFT JOIN "Group" g ON g."id" = u."groupId"
      WHERE u."role" <> 'SUPERADMIN'
        AND mp."active" = true
        AND mp."birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM mp."birthDate") = ${month}
        ${whereGroup}
      ORDER BY EXTRACT(DAY FROM mp."birthDate") ASC, u."name" ASC
    `);

    return NextResponse.json(birthdays);
  } catch (error) {
    console.error("Get birthdays error:", error);
    return NextResponse.json({ error: "Erro ao buscar aniversariantes" }, { status: 500 });
  }
}
