export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const song = await prisma.song.findUnique({
      where: { id: params?.id },
      include: { attachments: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Música não encontrada" }, { status: 404 });
    }

    return NextResponse.json(song);
  } catch (error) {
    console.error("Get song error:", error);
    return NextResponse.json({ error: "Erro ao buscar música" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { title, artist, bpm, originalKey, timeSignature, tags, lyrics, chordPro, audioUrl, youtubeUrl } = body ?? {};

    const song = await prisma.song.update({
      where: { id: params?.id },
      data: {
        title,
        artist: artist ?? null,
        bpm: bpm ? parseInt(bpm) : null,
        originalKey,
        timeSignature: timeSignature ?? "4/4",
        tags: tags ?? [],
        lyrics: lyrics ?? null,
        chordPro: chordPro ?? null,
        audioUrl: audioUrl ?? null,
        youtubeUrl: youtubeUrl ?? null,
      },
    });

    return NextResponse.json(song);
  } catch (error) {
    console.error("Update song error:", error);
    return NextResponse.json({ error: "Erro ao atualizar música" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await prisma.song.delete({
      where: { id: params?.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete song error:", error);
    return NextResponse.json({ error: "Erro ao excluir música" }, { status: 500 });
  }
}
