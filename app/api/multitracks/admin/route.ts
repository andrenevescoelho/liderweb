export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { downloadAndProcessZip } from "@/lib/multitracks-download";

// REMOVIDO — logica de download extraida para lib/multitracks-download.ts

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

// POST — cadastrar nova multitrack (salva metadados + driveZipUrl, SEM baixar agora)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    const body = await req.json();
    const { title, artist, genre, bpm, musicalKey, coverUrl, description, driveZipUrl } = body;

    if (!title || !artist) {
      return NextResponse.json({ error: "Titulo e artista sao obrigatorios" }, { status: 400 });
    }
    if (!driveZipUrl) {
      return NextResponse.json({ error: "URL do ZIP no Google Drive e obrigatoria" }, { status: 400 });
    }

    // Salvar apenas metadados + driveZipUrl — download acontece no primeiro aluguel
    const album = await (prisma as any).multitracksAlbum.create({
      data: {
        title,
        artist,
        genre: genre || null,
        bpm: bpm ? Number(bpm) : null,
        musicalKey: musicalKey || null,
        coverUrl: coverUrl || null,
        description: description || null,
        driveZipUrl,
        stems: [],
        status: "CATALOGED",
      },
    });

    console.log(`[multitracks/admin] Album catalogado (lazy): ${title} — download ocorrera no primeiro aluguel`);
    return NextResponse.json({ album, stemsCount: 0, lazy: true }, { status: 201 });

  } catch (err) {
    console.error("[multitracks/admin] POST error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /admin/download-now — forccar download imediato (opcional, para SUPERADMIN)
// Util para pre-popular tracks populares sem esperar aluguel
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
    }

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatorio" }, { status: 400 });

    const album = await (prisma as any).multitracksAlbum.findUnique({
      where: { id: albumId },
      select: { driveZipUrl: true, status: true, title: true },
    });

    if (!album) return NextResponse.json({ error: "Album nao encontrado" }, { status: 404 });
    if (album.status === "READY") return NextResponse.json({ message: "Album ja esta pronto" });
    if (!album.driveZipUrl) return NextResponse.json({ error: "Album sem driveZipUrl" }, { status: 422 });

    // Marcar como DOWNLOADING e processar
    await (prisma as any).multitracksAlbum.update({
      where: { id: albumId },
      data: { status: "DOWNLOADING" },
    });

    // Processar em background
    (async () => {
      try {
        const { createS3Client, getBucketConfig } = await import("@/lib/aws-config");
        const { downloadAndProcessZip } = await import("@/lib/multitracks-download");
        const s3Client = createS3Client();
        const { bucketName } = getBucketConfig();
        const { stems, detectedBpm } = await downloadAndProcessZip(album.driveZipUrl, albumId, bucketName, s3Client);
        await (prisma as any).multitracksAlbum.update({
          where: { id: albumId },
          data: { stems, status: "READY", bpm: album.bpm ?? detectedBpm ?? null },
        });
        console.log(`[admin/download-now] Concluido: ${album.title}`);
      } catch (err) {
        console.error(`[admin/download-now] Falhou: ${album.title}`, err);
        await (prisma as any).multitracksAlbum.update({
          where: { id: albumId },
          data: { status: "ERROR" },
        });
      }
    })();

    return NextResponse.json({ message: "Download iniciado em background", albumId }, { status: 202 });
  } catch (err) {
    console.error("[multitracks/admin] PUT error:", err);
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

    // Se enviou novo ZIP, apenas salvar a URL — nao baixar agora
    // Para forcar download imediato, usar PUT /api/multitracks/admin
    if (driveZipUrl) {
      data.driveZipUrl = driveZipUrl;
      // Resetar stems e status para CATALOGED se nao estiver READY
      const current = await (prisma as any).multitracksAlbum.findUnique({
        where: { id },
        select: { status: true },
      });
      if (current?.status !== "READY") {
        data.stems = [];
        data.status = "CATALOGED";
      }
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

    // Apagar arquivos do R2 (stems)
    const stems = (album.stems as any[]) ?? [];
    if (stems.length > 0) {
      const s3Client = createS3Client();
      const { bucketName } = getBucketConfig();
      await Promise.allSettled(
        stems
          .filter((s) => s.r2Key)
          .map((s) =>
            s3Client.send(
              new DeleteObjectCommand({ Bucket: bucketName, Key: s.r2Key })
            )
          )
      );
    }

    // Deletar rentals e usage primeiro (cascade deveria cuidar, mas por segurança)
    await prisma.multitracksRental.deleteMany({ where: { albumId: id } });
    await prisma.multitracksAlbum.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[multitracks/admin] DELETE error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
