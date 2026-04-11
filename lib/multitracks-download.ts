/**
 * lib/multitracks-download.ts
 *
 * Logica de download e processamento de ZIPs de multitrack do Google Drive.
 * Usada pelo admin (reprocessamento manual) e pelo worker de download lazy.
 */

import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEM_NAME_MAP: Record<string, string> = {
  AG: "Acoustic Guitar",
  BASS_SYNTH: "Bass Synth",
  BASS: "Bass",
  CLICK: "Click",
  DRUMS: "Drums",
  GUIA: "Guia",
  KEYBOARD: "Keyboard",
  KEYS_PAD: "Keys Pad",
  KEYS_SYNTH_1: "Keys Synth 1",
  KEYS_SYNTH: "Keys Synth",
  KEYS: "Keys",
  KEY_PIANO: "Key Piano",
  LOOP: "Loop",
  VOCALS: "Vocals",
  PAD: "Pad",
  STRINGS: "Strings",
  PIANO: "Piano",
  GUITAR: "Guitar",
};

export function cleanStemName(filename: string): string {
  const base = filename
    .replace(/\.(wav|mp3|aiff|flac)$/i, "")
    .replace(/_multitrackgospel\.com(_\d+)?$/i, "")
    .replace(/multitrackgospel\.com/i, "")
    .trim()
    .replace(/_+$/, "");
  const normalized = base.toUpperCase().replace(/[\s-]+/g, "_");
  for (const [key, label] of Object.entries(STEM_NAME_MAP)) {
    if (normalized === key || normalized.startsWith(key + "_")) return label;
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractBpmFromFilename(filename: string): number | null {
  const match = filename.match(/CLICK[_\s]+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

export function buildGoogleDriveDirectUrl(url: string): string {
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return `https://drive.google.com/uc?export=download&id=${idParamMatch[1]}`;
  return url;
}

async function convertToMp3(inputBuffer: Buffer, inputExt: string): Promise<Buffer | null> {
  const id = `stem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inputPath = join(tmpdir(), `${id}${inputExt}`);
  const outputPath = join(tmpdir(), `${id}.mp3`);
  try {
    await writeFile(inputPath, inputBuffer);
    await execAsync(
      `ffmpeg -i "${inputPath}" -codec:a libmp3lame -b:a 320k -y "${outputPath}"`,
      { timeout: 120000 }
    );
    return await readFile(outputPath);
  } catch (err) {
    console.warn("[multitracks-download] ffmpeg falhou:", err);
    return null;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

// ─── Download principal ───────────────────────────────────────────────────────

export async function downloadAndProcessZip(
  driveUrl: string,
  albumId: string,
  bucketName: string,
  s3Client: ReturnType<typeof createS3Client>
): Promise<{ stems: { name: string; r2Key: string }[]; detectedBpm: number | null }> {
  const directUrl = buildGoogleDriveDirectUrl(driveUrl);

  const firstResponse = await fetch(directUrl, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const contentType = firstResponse.headers.get("content-type") || "";
  let finalBuffer: Buffer;

  if (contentType.includes("text/html")) {
    const cookies = firstResponse.headers.get("set-cookie") || "";
    const html = await firstResponse.text();
    const confirmMatch =
      html.match(/confirm=([a-zA-Z0-9_-]+)/) ||
      html.match(/&amp;confirm=([a-zA-Z0-9_-]+)/) ||
      html.match(/"confirm","([a-zA-Z0-9_-]+)"/);
    const uuidMatch = html.match(/uuid=([a-zA-Z0-9_-]+)/);
    const fileId = directUrl.match(/id=([a-zA-Z0-9_-]+)/)?.[1];
    if (!fileId) throw new Error("Nao foi possivel extrair o ID do arquivo do Google Drive");

    let downloadUrl: string;
    if (confirmMatch) {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmMatch[1]}`;
      if (uuidMatch) downloadUrl += `&uuid=${uuidMatch[1]}`;
    } else {
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    }

    const secondResponse = await fetch(downloadUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookies },
    });
    if (!secondResponse.ok) throw new Error(`Falha ao baixar arquivo: ${secondResponse.status}`);
    finalBuffer = Buffer.from(await secondResponse.arrayBuffer());
  } else if (!firstResponse.ok) {
    throw new Error(`Falha ao baixar do Google Drive: ${firstResponse.status}`);
  } else {
    finalBuffer = Buffer.from(await firstResponse.arrayBuffer());
  }

  const zip = new AdmZip(finalBuffer);
  const entries = zip.getEntries().filter(
    (e) => !e.isDirectory && /\.(wav|mp3|aiff|flac)$/i.test(e.name) && !e.name.startsWith("__MACOSX")
  );

  if (entries.length === 0) throw new Error("Nenhum arquivo de audio encontrado no ZIP");

  let detectedBpm: number | null = null;
  const stems: { name: string; r2Key: string }[] = [];

  for (const entry of entries) {
    const stemName = cleanStemName(entry.name);
    if (!detectedBpm) detectedBpm = extractBpmFromFilename(entry.name);

    const rawData = entry.getData();
    const ext = entry.name.match(/\.\w+$/)?.[0].toLowerCase() ?? ".wav";
    const isAlreadyMp3 = ext === ".mp3";

    let fileData: Buffer;
    let finalKey: string;
    let mimeType: string;

    if (isAlreadyMp3) {
      fileData = rawData;
      finalKey = `multitracks-catalog/${albumId}/${entry.name}`;
      mimeType = "audio/mpeg";
    } else {
      const mp3Data = await convertToMp3(rawData, ext);
      if (mp3Data) {
        fileData = mp3Data;
        finalKey = `multitracks-catalog/${albumId}/${entry.name.replace(/\.(wav|aiff|flac)$/i, ".mp3")}`;
        mimeType = "audio/mpeg";
        console.log(`[multitracks-download] ${entry.name} convertido para MP3`);
      } else {
        fileData = rawData;
        finalKey = `multitracks-catalog/${albumId}/${entry.name}`;
        mimeType = "audio/wav";
      }
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: finalKey,
      Body: fileData,
      ContentType: mimeType,
    }));

    stems.push({ name: stemName, r2Key: finalKey });
  }

  return { stems, detectedBpm };
}

// ─── Worker — processa 1 job PENDING ─────────────────────────────────────────

const JOB_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutos — reset jobs travados

export async function processNextDownloadJob(): Promise<"processed" | "none" | "busy"> {
  // Reset jobs travados por timeout
  const timeout = new Date(Date.now() - JOB_TIMEOUT_MS);
  await (prisma as any).multitracksDownloadJob.updateMany({
    where: { status: "DOWNLOADING", startedAt: { lt: timeout } },
    data: { status: "PENDING", startedAt: null },
  });

  // Buscar próximo job PENDING
  const job = await (prisma as any).multitracksDownloadJob.findFirst({
    where: { status: "PENDING" },
    include: { album: true },
    orderBy: { createdAt: "asc" },
  });

  if (!job) return "none";

  // Marcar como DOWNLOADING (atomic — evita dois workers processando o mesmo job)
  const claimed = await (prisma as any).multitracksDownloadJob.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "DOWNLOADING", startedAt: new Date() },
  });

  if (claimed.count === 0) return "busy"; // outro worker pegou antes

  // Marcar album como DOWNLOADING
  await (prisma as any).multitracksAlbum.update({
    where: { id: job.albumId },
    data: { status: "DOWNLOADING" },
  });

  console.log(`[worker] Iniciando download: ${job.album.title} (job ${job.id})`);

  try {
    const s3Client = createS3Client();
    const { bucketName } = getBucketConfig();

    const { stems, detectedBpm } = await downloadAndProcessZip(
      job.album.driveZipUrl,
      job.albumId,
      bucketName,
      s3Client
    );

    // Atualizar album como READY
    await (prisma as any).multitracksAlbum.update({
      where: { id: job.albumId },
      data: {
        stems,
        status: "READY",
        bpm: job.album.bpm ?? detectedBpm ?? null,
      },
    });

    // Marcar job como DONE
    await (prisma as any).multitracksDownloadJob.update({
      where: { id: job.id },
      data: { status: "DONE", completedAt: new Date() },
    });

    console.log(`[worker] Download concluido: ${job.album.title} (${stems.length} stems)`);
    return "processed";

  } catch (err: any) {
    console.error(`[worker] Falha no download de ${job.album.title}:`, err);

    await (prisma as any).multitracksDownloadJob.update({
      where: { id: job.id },
      data: { status: "ERROR", errorMsg: err.message },
    });

    await (prisma as any).multitracksAlbum.update({
      where: { id: job.albumId },
      data: { status: "ERROR" },
    });

    return "processed";
  }
}

// ─── Enfileirar download ──────────────────────────────────────────────────────

export async function enqueueDownload(albumId: string, requestingGroupId: string): Promise<{
  jobId: string;
  isNew: boolean;
  status: string;
}> {
  // Verificar se album tem driveZipUrl
  const album = await (prisma as any).multitracksAlbum.findUnique({
    where: { id: albumId },
    select: { driveZipUrl: true, status: true },
  });

  if (!album?.driveZipUrl) throw new Error("Album sem URL do Google Drive configurada");
  if (album.status === "READY") return { jobId: "", isNew: false, status: "READY" };

  // Upsert job — se já existe, apenas adiciona o groupId aos requestedBy
  const existing = await (prisma as any).multitracksDownloadJob.findUnique({
    where: { albumId },
  });

  if (existing && ["PENDING", "DOWNLOADING"].includes(existing.status)) {
    // Adicionar groupId se ainda não está na lista
    if (!existing.requestedBy.includes(requestingGroupId)) {
      await (prisma as any).multitracksDownloadJob.update({
        where: { id: existing.id },
        data: { requestedBy: { push: requestingGroupId } },
      });
    }
    return { jobId: existing.id, isNew: false, status: existing.status };
  }

  // Criar novo job
  const job = await (prisma as any).multitracksDownloadJob.upsert({
    where: { albumId },
    create: {
      albumId,
      requestedBy: [requestingGroupId],
      status: "PENDING",
    },
    update: {
      status: "PENDING",
      requestedBy: [requestingGroupId],
      errorMsg: null,
      startedAt: null,
      completedAt: null,
    },
  });

  return { jobId: job.id, isNew: true, status: "PENDING" };
}
