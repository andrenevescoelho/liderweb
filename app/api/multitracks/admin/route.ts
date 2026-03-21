export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

// GET — listar acervo (admin)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN", "ADMIN"].includes(user.role)) {
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
      include: { _count: { select: { rentals: true } } },
    });

    return NextResponse.json({ albums });
  } catch (err) {
    console.error("[multitracks/admin] GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST — cadastrar nova multitrack
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["SUPERADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { title, artist, genre, bpm, musicalKey, coverUrl, description, stems } = body;

    if (!title || !artist) {
      return NextResponse.json({ error: "Título e artista são obrigatórios" }, { status: 400 });
    }

    if (!stems || !Array.isArray(stems) || stems.length === 0) {
      return NextResponse.json({ error: "Ao menos um stem é obrigatório" }, { status: 400 });
    }

    // Validar stems
    for (const stem of stems) {
      if (!stem.name || !stem.driveUrl) {
        return NextResponse.json({ error: "Cada stem precisa de nome e URL do Drive" }, { status: 400 });
      }
    }

    const album = await prisma.multitracksAlbum.create({
      data: {
        title,
        artist,
        genre: genre || null,
        bpm: bpm ? Number(bpm) : null,
        musicalKey: musicalKey || null,
        coverUrl: coverUrl || null,
        description: description || null,
        stems,
        status: "READY",
      },
    });

    return NextResponse.json({ album }, { status: 201 });
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
    if (!["SUPERADMIN", "ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

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
