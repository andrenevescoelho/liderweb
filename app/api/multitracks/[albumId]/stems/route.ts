export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { getFileUrl } from "@/lib/s3";

export async function GET(
  req: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { albumId } = params;

    // Verificar aluguel ativo
    const rental = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      include: { album: true },
    });

    if (!rental || rental.status !== "ACTIVE" || rental.expiresAt < new Date()) {
      return NextResponse.json({ error: "Acesso não autorizado. Alugue esta multitrack primeiro." }, { status: 403 });
    }

    const stems = Array.isArray(rental.album.stems)
      ? rental.album.stems as { name: string; driveUrl: string; r2Key: string | null }[]
      : [];

    // Gerar URLs assinadas para cada stem
    const stemsWithUrls = await Promise.all(
      stems.map(async (stem) => {
        const r2Key = `${rental.r2Folder}/${stem.name.toLowerCase().replace(/\s+/g, "-")}.mp3`;
        let url: string | null = null;
        try {
          url = await getFileUrl(r2Key, false);
        } catch {
          url = null;
        }
        return { name: stem.name, url };
      })
    );

    return NextResponse.json({
      album: {
        id: rental.album.id,
        title: rental.album.title,
        artist: rental.album.artist,
        bpm: rental.album.bpm,
        musicalKey: rental.album.musicalKey,
        coverUrl: rental.album.coverUrl,
      },
      stems: stemsWithUrls.filter((s) => s.url !== null),
      expiresAt: rental.expiresAt,
    });
  } catch (err) {
    console.error("[multitracks/stems] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
