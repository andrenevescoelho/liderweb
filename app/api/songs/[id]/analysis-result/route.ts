import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const apiToken = process.env.AUDIO_ANALYSIS_CALLBACK_TOKEN;
    if (apiToken) {
      const authHeader = req.headers.get("authorization") || "";
      if (authHeader !== `Bearer ${apiToken}`) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
    }

    const body = await req.json();
    const {
      analysisStatus,
      analysisError,
      bpmDetected,
      keyDetected,
      modeDetected,
      confidenceBpm,
      confidenceKey,
    } = body ?? {};

    const updated = await prisma.song.update({
      where: { id: params.id },
      data: {
        analysisStatus: analysisStatus ?? "FAILED",
        analysisError: analysisError ?? null,
        bpmDetected: bpmDetected ?? null,
        keyDetected: keyDetected ?? null,
        modeDetected: modeDetected ?? null,
        confidenceBpm: confidenceBpm ?? null,
        confidenceKey: confidenceKey ?? null,
      },
    });

    return NextResponse.json({ ok: true, songId: updated.id });
  } catch (error) {
    console.error("Analysis callback error:", error);
    return NextResponse.json({ error: "Erro ao salvar análise" }, { status: 500 });
  }
}
