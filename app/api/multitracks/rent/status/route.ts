export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { processNextDownloadJob } from "@/lib/multitracks-download";

/**
 * GET /api/multitracks/rent/status?albumId=xxx
 *
 * Polling endpoint chamado pelo frontend enquanto aguarda o download.
 * Tambem dispara o worker se houver job PENDING — sem necessidade de cron externo.
 *
 * Retorna:
 *   { status: "READY" | "DOWNLOADING" | "PENDING" | "ERROR", jobId?, errorMsg? }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    const { searchParams } = new URL(req.url);
    const albumId = searchParams.get("albumId");
    if (!albumId) return NextResponse.json({ error: "albumId obrigatorio" }, { status: 400 });

    // Buscar status atual do album + job
    const album = await (prisma as any).multitracksAlbum.findUnique({
      where: { id: albumId },
      select: { status: true, title: true },
    });

    if (!album) return NextResponse.json({ error: "Album nao encontrado" }, { status: 404 });

    // Se ja esta READY, retornar imediatamente
    if (album.status === "READY") {
      return NextResponse.json({ status: "READY" });
    }

    // Buscar job
    const job = await (prisma as any).multitracksDownloadJob.findUnique({
      where: { albumId },
      select: { id: true, status: true, errorMsg: true, requestedBy: true },
    });

    if (!job) {
      return NextResponse.json({ status: album.status });
    }

    // Se ha job PENDING, tentar disparar o worker neste request
    // O worker usa update atomico — so um request vai processar, os outros retornam "busy"
    if (job.status === "PENDING") {
      // Disparar em background sem bloquear a resposta
      processNextDownloadJob().catch((err) => {
        console.error("[rent/status] worker error:", err);
      });
    }

    return NextResponse.json({
      status: job.status === "DONE" ? "READY" : job.status,
      jobId: job.id,
      errorMsg: job.errorMsg ?? null,
      albumTitle: album.title,
    });

  } catch (err) {
    console.error("[rent/status] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
