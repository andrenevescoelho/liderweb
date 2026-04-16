export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const songName   = searchParams.get("songName")?.trim() ?? "";
    const artistName = searchParams.get("artistName")?.trim() ?? "";
    if (!songName) return NextResponse.json({ duplicate: false });

    // 1. No próprio grupo
    const ownJob = await (prisma as any).splitJob.findFirst({
      where: {
        groupId: user.groupId,
        songName: { equals: songName, mode: "insensitive" },
        status: { in: ["DONE", "PROCESSING", "PENDING", "ANALYZING", "GENERATING"] },
      },
      select: { id: true, status: true, songName: true, artistName: true },
    });

    if (ownJob) {
      return NextResponse.json({
        duplicate: true,
        location: "own",
        job: ownJob,
        message: `Você já tem um split de "${songName}" (${ownJob.status === "DONE" ? "concluído" : "em andamento"}).`,
      });
    }

    // 2. No catálogo público
    const catalogJob = await (prisma as any).splitJob.findFirst({
      where: {
        groupId: { not: user.groupId },
        songName: { equals: songName, mode: "insensitive" },
        status: "DONE",
        isPublic: true,
        purchasedFrom: null,
      },
      select: { id: true, songName: true, artistName: true, bpm: true, musicalKey: true,
        durationSec: true, priceInCents: true,
        stems: { select: { displayName: true } } },
    });

    if (catalogJob) {
      return NextResponse.json({
        duplicate: true,
        location: "catalog",
        job: catalogJob,
        message: `Este split já existe no catálogo. Deseja adquirir em vez de processar?`,
        priceInCents: catalogJob.priceInCents ?? 490,
      });
    }

    return NextResponse.json({ duplicate: false });
  } catch (err: any) {
    console.error("[splits/check-duplicate] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
