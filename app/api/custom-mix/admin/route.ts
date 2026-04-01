export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    const [total, thisMonth, recent, byAlbum, byGroup] = await Promise.all([
      (prisma as any).customMix.count(),
      (prisma as any).customMix.count({ where: { createdAt: { gte: startOfMonth } } }),
      (prisma as any).customMix.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          album: { select: { title: true, artist: true } },
          group: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      // Top multitracks mais mixadas
      prisma.$queryRaw<{ albumId: string; title: string; artist: string; count: number }[]>`
        SELECT cm."albumId", ma.title, ma.artist, COUNT(cm.id)::int AS count
        FROM "CustomMix" cm
        JOIN "MultitracksAlbum" ma ON ma.id = cm."albumId"
        GROUP BY cm."albumId", ma.title, ma.artist
        ORDER BY count DESC
        LIMIT 10
      `,
      // Top grupos que mais criam mixes
      prisma.$queryRaw<{ groupId: string; groupName: string; count: number }[]>`
        SELECT cm."groupId", g.name AS "groupName", COUNT(cm.id)::int AS count
        FROM "CustomMix" cm
        JOIN "Group" g ON g.id = cm."groupId"
        GROUP BY cm."groupId", g.name
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    const totalGroups = await (prisma as any).customMix.groupBy({ by: ["groupId"], _count: true }).then((r: any[]) => r.length);

    return NextResponse.json({ total, thisMonth, totalGroups, recent, byAlbum, byGroup });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
