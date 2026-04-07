export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import AdmZip from "adm-zip";

// Mapa de prefixos para nomes legíveis
const STEM_NAME_MAP: Record<string, string> = {
  "AG": "Acoustic Guitar",
  "BASS_SYNTH": "Bass Synth",
  "BASS": "Bass",
  "CLICK": "Click",
  "DRUMS": "Drums",
  "GUIA": "Guia",
  "KEYBOARD": "Keyboard",
  "KEYS_PAD": "Keys Pad",
  "KEYS_SYNTH_1": "Keys Synth 1",
  "KEYS_SYNTH": "Keys Synth",
  "KEYS": "Keys",
  "KEY_PIANO": "Key Piano",
  "LOOP": "Loop",
  "VOCALS": "Vocals",
  "PAD": "Pad",
  "STRINGS": "Strings",
  "PIANO": "Piano",
  "GUITAR": "Guitar",
};

function cleanStemName(filename: string): string {
  // Remove extensão e sufixo padrão
  const base = filename
    .replace(/\.(wav|mp3|aiff|flac)$/i, "")
    .replace(/_multitrackgospel\.com(_\d+)?$/i, "")
    .replace(/multitrackgospel\.com/i, "")
    .trim()
    .replace(/_+$/, "");

  // Tenta mapear pelo prefixo normalizado
  const normalized = base.toUpperCase().replace(/[\s-]+/g, "_");
  for (const [key, label] of Object.entries(STEM_NAME_MAP)) {
    if (normalized === key || normalized.startsWith(key + "_")) {
      return label;
    }
  }

  // Fallback: capitaliza o nome limpo
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractBpmFromFilename(filename: string): number | null {
  const match = filename.match(/CLICK[_\s]+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function buildGoogleDriveDirectUrl(url: string): string {
  // Converte link de compartilhamento para link de download direto
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }
  const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) {
    return `https://drive.google.com/uc?export=download&id=${idParamMatch[1]}`;
  }
  return url;
}

async function downloadAndProcessZip(
  driveUrl: string,
  albumId: string,
  bucketName: string,
  s3Client: ReturnType<typeof createS3Client>
): Promise<{ stems: { name: string; r2Key: string }[]; detectedBpm: number | null }> {
  const directUrl = buildGoogleDriveDirectUrl(driveUrl);

  // Para arquivos grandes o Google Drive exige confirmação via cookie
  // Fazemos a primeira request para pegar o cookie de confirmação
  const firstResponse = await fetch(directUrl, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const contentType = firstResponse.headers.get("content-type") || "";
  let finalBuffer: Buffer;

  if (contentType.includes("text/html")) {
    // Pegar cookies da resposta
    const cookies = firstResponse.headers.get("set-cookie") || "";
    const html = await firstResponse.text();

    // Tentar extrair token de confirmação do HTML
    const confirmMatch =
      html.match(/confirm=([a-zA-Z0-9_-]+)/) ||
      html.match(/&amp;confirm=([a-zA-Z0-9_-]+)/) ||
      html.match(/"confirm","([a-zA-Z0-9_-]+)"/);

    // Extrair uuid se houver
    const uuidMatch = html.match(/uuid=([a-zA-Z0-9_-]+)/);

    const fileId = directUrl.match(/id=([a-zA-Z0-9_-]+)/)?.[1];
    if (!fileId) throw new Error("Não foi possível extrair o ID do arquivo do Google Drive");

    let downloadUrl: string;
    if (confirmMatch) {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmMatch[1]}`;
      if (uuidMatch) downloadUrl += `&uuid=${uuidMatch[1]}`;
    } else {
      // Fallback: usar endpoint alternativo do Drive
      downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    }

    const secondResponse = await fetch(downloadUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": cookies,
      },
    });

    if (!secondResponse.ok) {
      throw new Error(`Falha ao baixar arquivo: ${secondResponse.status}`);
    }

    finalBuffer = Buffer.from(await secondResponse.arrayBuffer());
  } else if (!firstResponse.ok) {
    throw new Error(`Falha ao baixar do Google Drive: ${firstResponse.status}`);
  } else {
    finalBuffer = Buffer.from(await firstResponse.arrayBuffer());
  }

  const zip = new AdmZip(finalBuffer);
  const entries = zip.getEntries();

  const audioEntries = entries.filter((e) =>
    !e.isDirectory && /\.(wav|mp3|aiff|flac)$/i.test(e.name) && !e.name.startsWith("__MACOSX")
  );

  if (audioEntries.length === 0) {
    throw new Error("Nenhum arquivo de áudio encontrado no ZIP");
  }

  let detectedBpm: number | null = null;
  const stems: { name: string; r2Key: string }[] = [];

  for (const entry of audioEntries) {
    const stemName = cleanStemName(entry.name);
    const r2Key = `multitracks-catalog/${albumId}/${entry.name}`;

    // Detectar BPM pelo CLICK
    if (!detectedBpm) {
      detectedBpm = extractBpmFromFilename(entry.name);
    }

    const fileData = entry.getData();

    const mimeType = entry.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      Body: fileData,
      ContentType: mimeType,
    }));

    stems.push({ name: stemName, r2Key });
  }

  return { stems, detectedBpm };
}

// GET — listar acervo
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q") || "";

    const albums = await prisma.multitracksAlbum.findMany({
      where: search ? {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { artist: { contains: search, mode: "insensitive" } },
        ],
      } : {},
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        bpm: true,
        musicalKey: true,
        coverUrl: true,
        status: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        songId: true,
        stems: true,
        _count: { select: { rentals: true } },
      },
    });

    return NextResponse.json({ albums });
  } catch (err) {
    console.error("[multitracks/admin] GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST — cadastrar nova multitrack (processa ZIP do Google Drive)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { title, artist, genre, bpm, musicalKey, coverUrl, description, driveZipUrl } = body;

    if (!title || !artist) {
      return NextResponse.json({ error: "Título e artista são obrigatórios" }, { status: 400 });
    }
    if (!driveZipUrl) {
      return NextResponse.json({ error: "URL do ZIP no Google Drive é obrigatória" }, { status: 400 });
    }

    // Criar album como PENDING primeiro
    const album = await prisma.multitracksAlbum.create({
      data: {
        title,
        artist,
        genre: genre || null,
        bpm: bpm ? Number(bpm) : null,
        musicalKey: musicalKey || null,
        coverUrl: coverUrl || null,
        description: description || null,
        stems: [],
        status: "PENDING",
      },
    });

    try {
      const s3Client = createS3Client();
      const { bucketName } = getBucketConfig();

      const { stems, detectedBpm } = await downloadAndProcessZip(
        driveZipUrl,
        album.id,
        bucketName,
        s3Client
      );

      // Atualizar album com stems e BPM detectado
      const updatedAlbum = await prisma.multitracksAlbum.update({
        where: { id: album.id },
        data: {
          stems,
          status: "READY",
          bpm: bpm ? Number(bpm) : (detectedBpm ?? null),
        },
      });

      return NextResponse.json({ album: updatedAlbum, stemsCount: stems.length }, { status: 201 });
    } catch (processErr) {
      // Marcar como ERROR mas não deletar
      await prisma.multitracksAlbum.update({
        where: { id: album.id },
        data: { status: "ERROR" },
      });
      console.error("[multitracks/admin] ZIP processing error:", processErr);
      return NextResponse.json({
        error: `Erro ao processar ZIP: ${processErr instanceof Error ? processErr.message : "erro desconhecido"}`,
        albumId: album.id,
      }, { status: 422 });
    }
  } catch (err) {
    console.error("[multitracks/admin] POST error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PATCH — atualizar multitrack
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { id, driveZipUrl, ...data } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Sanitizar campos opcionais — string vazia vira null para não violar FK
    const NULLABLE_FIELDS = ["songId", "genre", "coverUrl", "musicalKey", "description"];
    for (const field of NULLABLE_FIELDS) {
      if (field in data && (data[field] === "" || data[field] === undefined)) {
        data[field] = null;
      }
    }
    if ("bpm" in data && (data.bpm === "" || data.bpm === null)) {
      data.bpm = null;
    } else if ("bpm" in data && data.bpm !== undefined) {
      data.bpm = Number(data.bpm) || null;
    }

    // Se enviou novo ZIP, reprocessar
    if (driveZipUrl) {
      const s3Client = createS3Client();
      const { bucketName } = getBucketConfig();
      const { stems, detectedBpm } = await downloadAndProcessZip(driveZipUrl, id, bucketName, s3Client);
      data.stems = stems;
      data.status = "READY";
      if (!data.bpm && detectedBpm) data.bpm = detectedBpm;
    }

    const album = await prisma.multitracksAlbum.update({
      where: { id },
      data,
    });

    return NextResponse.json({ album });
  } catch (err) {
    console.error("[multitracks/admin] PATCH error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE — excluir multitrack
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Verificar se existe
    const album = await prisma.multitracksAlbum.findUnique({ where: { id } });
    if (!album) return NextResponse.json({ error: "Multitrack não encontrada" }, { status: 404 });

    // Deletar rentals e usage primeiro (cascade deveria cuidar, mas por segurança)
    await prisma.multitracksRental.deleteMany({ where: { albumId: id } });
    await prisma.multitracksAlbum.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[multitracks/admin] DELETE error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
