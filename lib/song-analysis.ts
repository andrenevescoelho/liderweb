import { prisma } from "@/lib/db";

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
    return;
  }

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
    await prisma.song.update({
      where: { id: songId },
      data: {
        analysisStatus: "FAILED",
        analysisError: `Falha ao enfileirar job: ${body}`,
      },
    });

    throw new Error(`Failed to enqueue song analysis for song ${songId}`);
  }
}
