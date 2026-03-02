import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { enqueueSongAnalysis } from "@/lib/song-analysis";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || !["SUPERADMIN", "ADMIN", "LEADER"].includes(userRole)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const song = await prisma.song.findUnique({ where: { id: params.id } });

    if (!song) {
      return NextResponse.json({ error: "Música não encontrada" }, { status: 404 });
    }

    if (!song.audioUrl && !song.youtubeUrl) {
      return NextResponse.json(
        { error: "A música não possui áudio ou link do YouTube para análise." },
        { status: 400 }
      );
    }

    const enqueueResult = await enqueueSongAnalysis(song.id);

    return NextResponse.json({
      ok: enqueueResult.analysisStatus === "PENDING",
      songId: song.id,
      analysisStatus: enqueueResult.analysisStatus,
      analysisError: enqueueResult.analysisError,
    });
  } catch (error) {
    console.error("Analyze song error:", error);
    return NextResponse.json({ error: "Erro ao iniciar análise" }, { status: 500 });
  }
}
