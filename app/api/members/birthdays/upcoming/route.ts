export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { SessionUser } from "@/lib/types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const getNextBirthdayOccurrence = (birthDate: Date, now: Date) => {
  const currentYear = now.getFullYear();
  let nextBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());

  if (nextBirthday < now) {
    nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
  }

  return nextBirthday;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const searchParams = req.nextUrl.searchParams;
    const daysParam = Number.parseInt(searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(daysParam) && [7, 14, 30].includes(daysParam) ? daysParam : 14;

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = (currentMonth % 12) + 1;

    const groupIdParam = searchParams.get("groupId");
    const scopedGroupId = user.role === "SUPERADMIN" ? groupIdParam : user.groupId;

    if (user.role !== "SUPERADMIN" && !scopedGroupId) {
      return NextResponse.json([]);
    }

    const whereGroup = scopedGroupId
      ? Prisma.sql`AND u."groupId" = ${scopedGroupId}`
      : Prisma.empty;

    const candidates = await prisma.$queryRaw<Array<{
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
        AND EXTRACT(MONTH FROM mp."birthDate") IN (${currentMonth}, ${nextMonth})
        ${whereGroup}
      ORDER BY u."name" ASC
    `);

    const upcoming = candidates
      .map((member) => {
        const birthDate = new Date(member.birthDate);
        const nextBirthday = getNextBirthdayOccurrence(birthDate, now);
        const daysUntilBirthday = Math.ceil((nextBirthday.getTime() - now.getTime()) / MS_PER_DAY);

        return {
          ...member,
          birthDate,
          nextBirthday,
          daysUntilBirthday,
        };
      })
      .filter((item) => item.daysUntilBirthday >= 0 && item.daysUntilBirthday <= days)
      .sort((a, b) => {
        if (a.daysUntilBirthday !== b.daysUntilBirthday) return a.daysUntilBirthday - b.daysUntilBirthday;
        return a.name.localeCompare(b.name, "pt-BR");
      });

    return NextResponse.json(upcoming);
  } catch (error) {
    console.error("Get upcoming birthdays error:", error);
    return NextResponse.json({ error: "Erro ao buscar próximos aniversários" }, { status: 500 });
  }
}
