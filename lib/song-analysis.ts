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
      body: JSON.stringify({ songId }),
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
