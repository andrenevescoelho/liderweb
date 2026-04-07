export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import {
  lalalUpload, lalalSplit, lalalWaitForCompletion, downloadAndUploadToR2,
  analyzeWithGemini,
  STEM_DISPLAY_NAMES, type LalalStem,
} from "@/lib/split-service";

const DEFAULT_STEMS: LalalStem[] = ["vocals", "drum", "bass", "piano", "electric_guitar", "acoustic_guitar", "synthesizer"];
const VALID_STEMS = new Set(["vocals","drum","bass","piano","electric_guitar","acoustic_guitar","synthesizer","strings","wind"]);

async function updateJob(jobId: string, status: string, extra: Record<string, any> = {}) {
  await (prisma as any).splitJob.update({ where: { id: jobId }, data: { status, ...extra } });
}

export async function POST(req: NextRequest) {
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey !== (process.env.NEXTAUTH_SECRET ?? "")) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { jobId } = await req.json();
  if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

  const job = await (prisma as any).splitJob.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

  const s3Client = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();

  try {
    // ETAPA 1: Baixar arquivo do R2
    await updateJob(jobId, "UPLOADING");
    const r2Obj = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: job.sourceFileKey }));
    const fileBuffer = Buffer.from(await r2Obj.Body!.transformToByteArray());

    // ETAPA 2: Upload para lalal.ai + iniciar split
    const lalalSourceId = await lalalUpload(fileBuffer, job.fileName);
    await updateJob(jobId, "PROCESSING", { lalalSourceId });

    // Usar stems selecionados pelo usuário (armazenados temporariamente em sections)
    const jobStems = Array.isArray(job.sections)
      ? (job.sections as string[]).filter((s: string) => VALID_STEMS.has(s)) as LalalStem[]
      : DEFAULT_STEMS;
    const stemsToProcess = jobStems.length > 0 ? jobStems : DEFAULT_STEMS;

    const taskIds = await lalalSplit(lalalSourceId, stemsToProcess);
    await (prisma as any).splitJob.update({ where: { id: jobId }, data: { lalalTaskId: taskIds.join(",") } });

    // ETAPA 3: Aguardar conclusão
    const results = await lalalWaitForCompletion(taskIds);

    // ETAPA 4: Analisar com Gemini
    await updateJob(jobId, "ANALYZING");
    const ext = job.fileName.split(".").pop()?.toLowerCase() ?? "mp3";
    const mimeMap: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac", ogg: "audio/ogg" };
    const mimeType = mimeMap[ext] ?? "audio/mpeg";
    const estimatedDuration = job.fileSizeBytes ? job.fileSizeBytes / (128000 / 8) : 180;

    let analysis = { bpm: 120, musicalKey: "C Major", sections: [] as any[] };
    try {
      analysis = await analyzeWithGemini(fileBuffer.toString("base64"), mimeType, estimatedDuration);
    } catch (err) {
      console.error("[splits/process] Gemini analysis failed:", err);
      analysis.sections = [
        { label: "Intro", startSec: 0, endSec: 8 },
        { label: "Verso", startSec: 8, endSec: estimatedDuration * 0.4 },
        { label: "Refrão", startSec: estimatedDuration * 0.4, endSec: estimatedDuration * 0.7 },
        { label: "Outro", startSec: estimatedDuration * 0.7, endSec: estimatedDuration },
      ];
    }
    await (prisma as any).splitJob.update({ where: { id: jobId }, data: { bpm: analysis.bpm, musicalKey: analysis.musicalKey, sections: analysis.sections } });

    // ETAPA 5: Gerar metrônomo + guia + salvar stems
    await updateJob(jobId, "GENERATING");
    const stemPrefix = `${folderPrefix}splits/${job.groupId}/${jobId}`;
    const stemRecords: any[] = [];

    // Stems do lalal.ai
    for (const result of results) {
      if (result.status !== "success" || !result.tracks) continue;
      for (const track of result.tracks) {
        if (track.label.startsWith("no_") && track.label !== "no_vocals") continue;
        const r2Key = `${stemPrefix}/${track.label}.wav`;
        try {
          await downloadAndUploadToR2(track.url, r2Key);
          stemRecords.push({
            jobId, label: track.label,
            displayName: STEM_DISPLAY_NAMES[track.label] ?? track.label,
            fileKey: r2Key, type: track.type === "stem" ? "INSTRUMENT" : "BACKING",
          });
        } catch (err) { console.error(`[splits] stem ${track.label} falhou:`, err); }
      }
    }


    await (prisma as any).splitStem.createMany({ data: stemRecords });
    await updateJob(jobId, "DONE", { durationSec: estimatedDuration, sections: analysis.sections });

    // Limpar da lalal.ai
    fetch("https://www.lalal.ai/api/v1/delete/", {
      method: "POST",
      headers: { "X-License-Key": process.env.LALAL_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: lalalSourceId }),
    }).catch(() => {});

    return NextResponse.json({ success: true, jobId });
  } catch (error: any) {
    console.error("[splits/process] error:", error);
    await (prisma as any).splitJob.update({ where: { id: jobId }, data: { status: "FAILED", errorMessage: error.message } }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
