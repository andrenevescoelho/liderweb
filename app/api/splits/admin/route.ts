export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET — histórico de jobs e ações de splits para SUPERADMIN
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search  = searchParams.get("search")?.trim() ?? "";
    const status  = searchParams.get("status") ?? "";
    const limit   = Number(searchParams.get("limit") ?? 100);

    // Buscar todos os SplitJobs com dados de grupo e usuário
    const jobs = await (prisma as any).splitJob.findMany({
      where: {
        ...(search ? {
          OR: [
            { songName:   { contains: search, mode: "insensitive" } },
            { artistName: { contains: search, mode: "insensitive" } },
            { group: { name: { contains: search, mode: "insensitive" } } },
            { user:  { name: { contains: search, mode: "insensitive" } } },
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
      take: limit,
    });

    // Estatísticas gerais
    const stats = await (prisma as any).splitJob.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statsMap = stats.reduce((acc: any, s: any) => {
      acc[s.status] = s._count.id;
      return acc;
    }, {});

    // Uso mensal
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyCount = await (prisma as any).splitJob.count({
      where: { createdAt: { gte: startOfMonth } },
    });

    // Grupos mais ativos
    const topGroups = await (prisma as any).splitJob.groupBy({
      by: ["groupId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const topGroupIds = topGroups.map((g: any) => g.groupId);
    const groupNames = await prisma.group.findMany({
      where: { id: { in: topGroupIds } },
      select: { id: true, name: true },
    });

    const topGroupsWithNames = topGroups.map((g: any) => ({
      groupId: g.groupId,
      count: g._count.id,
      name: groupNames.find((gn: any) => gn.id === g.groupId)?.name ?? "—",
    }));

    return NextResponse.json({
      jobs,
      stats: {
        total:        jobs.length,
        byStatus:     statsMap,
        thisMonth:    monthlyCount,
        topGroups:    topGroupsWithNames,
      },
    });
  } catch (err: any) {
    console.error("[splits/admin] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — marcar split como público (acervo)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { jobId, isPublic } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

    // Atualizar metadata do job (usando field genérico por enquanto)
    const job = await (prisma as any).splitJob.update({
      where: { id: jobId },
      data: { metadata: { isPublic: Boolean(isPublic), priceInCents: 490 } } as any,
    });

    return NextResponse.json({ ok: true, job });
  } catch (err: any) {
    console.error("[splits/admin] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
