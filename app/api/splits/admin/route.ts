export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "";

    const jobs = await (prisma as any).splitJob.findMany({
      where: {
        ...(search ? {
          OR: [
            { songName:   { contains: search, mode: "insensitive" } },
            { artistName: { contains: search, mode: "insensitive" } },
            { group: { name: { contains: search, mode: "insensitive" } } },
          ],
        } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        group: { select: { id: true, name: true } },
        user:  { select: { id: true, name: true, email: true } },
        stems: { select: { id: true, label: true, displayName: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const stats = await (prisma as any).splitJob.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const statsMap = stats.reduce((acc: any, s: any) => {
      acc[s.status] = s._count.id;
      return acc;
    }, {});

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyCount = await (prisma as any).splitJob.count({
      where: { createdAt: { gte: startOfMonth } },
    });

    const topGroups = await (prisma as any).splitJob.groupBy({
      by: ["groupId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });
    const groupNames = await prisma.group.findMany({
      where: { id: { in: topGroups.map((g: any) => g.groupId) } },
      select: { id: true, name: true },
    });
    const topGroupsWithNames = topGroups.map((g: any) => ({
      groupId: g.groupId,
      count: g._count.id,
      name: groupNames.find((gn: any) => gn.id === g.groupId)?.name ?? "—",
    }));

    return NextResponse.json({
      jobs,
      stats: { byStatus: statsMap, thisMonth: monthlyCount, topGroups: topGroupsWithNames },
    });
  } catch (err: any) {
    console.error("[splits/admin] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — marcar split como público no acervo
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { jobId, isPublic, priceInCents } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

    const job = await (prisma as any).splitJob.update({
      where: { id: jobId },
      data: {
        isPublic: Boolean(isPublic),
        priceInCents: priceInCents ?? 490,
      },
    });

    logUserAction({
      userId: user.id, groupId: null,
      action: AUDIT_ACTIONS.SPLIT_MARKED_PUBLIC,
      entityType: AuditEntityType.OTHER,
      entityId: jobId, entityName: job.songName,
      description: `Split ${isPublic ? 'marcado como público' : 'removido do acervo'}: ${job.songName}`,
      metadata: { jobId, isPublic, priceInCents },
    }).catch(() => {});
    return NextResponse.json({ ok: true, job });
  } catch (err: any) {
    console.error("[splits/admin] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
