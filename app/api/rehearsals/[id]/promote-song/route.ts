export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const db = prisma as any;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!["SUPERADMIN", "ADMIN", "LEADER"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { rehearsalSongId } = await req.json();
    if (!rehearsalSongId) return NextResponse.json({ error: "Música do ensaio é obrigatória" }, { status: 400 });

    const rehearsalSong = await db.rehearsalSong.findFirst({
      where: { id: rehearsalSongId, rehearsalId: params.id },
    });

    if (!rehearsalSong) return NextResponse.json({ error: "Música do ensaio não encontrada" }, { status: 404 });

    let songId = rehearsalSong.songId;

    if (!songId) {
      const existingSong = await db.song.findFirst({
        where: {
          groupId: user.groupId ?? undefined,
          title: rehearsalSong.title,
          artist: rehearsalSong.artist || undefined,
        },
      });

      if (existingSong) {
        songId = existingSong.id;
      } else {
        const createdSong = await db.song.create({
          data: {
            groupId: user.groupId ?? null,
            title: rehearsalSong.title,
            artist: rehearsalSong.artist,
            originalKey: rehearsalSong.key || "C",
            bpm: rehearsalSong.bpm,
            tags: rehearsalSong.tags,
            lyrics: rehearsalSong.notes || undefined,
          },
        });
        songId = createdSong.id;
      }
    }

    const updated = await db.rehearsalSong.update({
      where: { id: rehearsalSongId },
      data: { songId, status: "PROMOTED" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Promote rehearsal song error:", error);
    return NextResponse.json({ error: "Erro ao promover música" }, { status: 500 });
  }
}
