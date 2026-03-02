import { prisma } from "@/lib/db";

type SongAnalysisEnqueueResult = {
  analysisStatus: "PENDING" | "FAILED";
  analysisError: string | null;
};

export async function enqueueSongAnalysis(songId: string) {
  const serviceBaseUrl = process.env.AUDIO_ANALYSIS_SERVICE_URL;
  const serviceToken = process.env.AUDIO_ANALYSIS_SERVICE_TOKEN;

  await prisma.song.update({
    where: { id: songId },
    data: {
      analysisStatus: "PENDING",
      analysisError: null,
    },
  });

  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      sourceType: true,
      audioUrl: true,
      youtubeUrl: true,
    },
  });

  if (!song) {
    const analysisError = "Música não encontrada para análise automática.";

    await prisma.song.update({
      where: { id: songId },
      data: {
        analysisStatus: "FAILED",
        analysisError,
      },
    });

    return {
      analysisStatus: "FAILED",
      analysisError,
    } satisfies SongAnalysisEnqueueResult;
  }

  const sourceType = song.sourceType;
  const sourceUrl = sourceType === "YOUTUBE" ? song.youtubeUrl : sourceType === "UPLOAD" ? song.audioUrl : null;

  if (!sourceType || !sourceUrl) {
    const analysisError = "Fonte de áudio inválida para análise automática.";

    await prisma.song.update({
      where: { id: songId },
      data: {
        analysisStatus: "FAILED",
        analysisError,
      },
    });

    return {
      analysisStatus: "FAILED",
      analysisError,
    } satisfies SongAnalysisEnqueueResult;
  }

  if (!serviceBaseUrl) {
    const analysisError =
      "Serviço de análise automática não configurado. Defina AUDIO_ANALYSIS_SERVICE_URL.";

    await prisma.song.update({
      where: { id: songId },
      data: {
        analysisStatus: "FAILED",
        analysisError,
      },
    });

    return {
      analysisStatus: "FAILED",
      analysisError,
    } satisfies SongAnalysisEnqueueResult;
  }

  try {
    const response = await fetch(`${serviceBaseUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      },
      body: JSON.stringify({
        songId: song.id,
        sourceType,
        sourceUrl,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const analysisError = `Falha ao enfileirar job: ${body}`;

      await prisma.song.update({
        where: { id: songId },
        data: {
          analysisStatus: "FAILED",
          analysisError,
        },
      });

      return {
        analysisStatus: "FAILED",
        analysisError,
      } satisfies SongAnalysisEnqueueResult;
    }

    return {
      analysisStatus: "PENDING",
      analysisError: null,
    } satisfies SongAnalysisEnqueueResult;
  } catch (error) {
    const analysisError =
      error instanceof Error
        ? `Falha de conexão com o serviço de análise: ${error.message}`
        : "Falha de conexão com o serviço de análise.";

    await prisma.song.update({
      where: { id: songId },
      data: {
        analysisStatus: "FAILED",
        analysisError,
      },
    });

    return {
      analysisStatus: "FAILED",
      analysisError,
    } satisfies SongAnalysisEnqueueResult;
  }
}
