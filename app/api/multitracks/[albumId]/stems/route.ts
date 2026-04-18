export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

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

    const albumStatus = rental.album.status;

    // Album ainda sendo preparado — retornar status para o player fazer polling
    if (albumStatus !== "READY" || !Array.isArray(rental.album.stems) || (rental.album.stems as any[]).length === 0) {
      return NextResponse.json({
        preparing: true,
        albumStatus,
        pollUrl: `/api/multitracks/rent/status?albumId=${albumId}`,
        album: {
          id: rental.album.id,
          title: rental.album.title,
          artist: rental.album.artist,
          coverUrl: rental.album.coverUrl,
        },
        stems: [],
        markers: [],
        expiresAt: rental.expiresAt,
      });
    }

    const stems = rental.album.stems as { name: string; r2Key: string }[];

    // Retornar URLs do proxy backend em vez de URLs assinadas do R2
    const stemsWithUrls = stems.map((stem, i) => ({
      name: stem.name,
      url: `/api/multitracks/${albumId}/audio/${i}`,
    }));

    return NextResponse.json({
      album: {
        id: rental.album.id,
        title: rental.album.title,
        artist: rental.album.artist,
        bpm: rental.album.bpm,
        musicalKey: rental.album.musicalKey,
        coverUrl: rental.album.coverUrl,
      },
      stems: stemsWithUrls,
      markers: (rental.album as any).markers ?? [],
      expiresAt: rental.expiresAt,
    });
  } catch (err) {
    console.error("[multitracks/stems] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
