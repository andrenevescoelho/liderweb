export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/splits/check-duplicate?songName=X&artistName=Y
// Verifica se já existe split da música — no próprio grupo ou no catálogo público
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

    // 1. Verificar no próprio grupo
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

    // 2. Verificar no catálogo público
    const catalogJob = await (prisma as any).splitJob.findFirst({
      where: {
        groupId: { not: user.groupId },
        songName: { equals: songName, mode: "insensitive" },
        status: "DONE",
      },
      select: { id: true, songName: true, artistName: true, bpm: true, musicalKey: true, durationSec: true,
        stems: { select: { displayName: true } }, metadata: true },
    });

    if (catalogJob?.metadata?.isPublic) {
      return NextResponse.json({
        duplicate: true,
        location: "catalog",
        job: catalogJob,
        message: `Este split já existe no catálogo por R$ ${((catalogJob.metadata?.priceInCents ?? 490) / 100).toFixed(2).replace(".", ",")}. Deseja adquirir em vez de processar?`,
        priceInCents: catalogJob.metadata?.priceInCents ?? 490,
      });
    }

    return NextResponse.json({ duplicate: false });
  } catch (err: any) {
    console.error("[splits/check-duplicate] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
