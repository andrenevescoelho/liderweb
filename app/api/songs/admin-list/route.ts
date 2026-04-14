export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * GET — listar músicas para o painel SUPERADMIN
 *
 * Lógica de exibição:
 * 1. Músicas globais (groupId = null) sempre aparecem
 * 2. Músicas de grupos SÓ aparecem se não houver versão global com mesmo título+artista
 *    → essas são candidatas a "Promover para global"
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const songs = await prisma.song.findMany({
      where: search ? {
        OR: [
          { title:  { contains: search, mode: "insensitive" } },
          { artist: { contains: search, mode: "insensitive" } },
        ],
      } : {},
      orderBy: [{ title: "asc" }, { groupId: "asc" }],
      take: 1000,
      select: {
        id: true,
        title: true,
        artist: true,
        bpm: true,
        originalKey: true,
        youtubeUrl: true,
        groupId: true,
        createdAt: true,
        group: { select: { name: true } },
      },
    });

    // Separar globais e de grupos
    const globals = new Set<string>();
    for (const s of songs) {
      if (!s.groupId) {
        const key = `${s.title.toLowerCase().trim()}||${(s.artist ?? "").toLowerCase().trim()}`;
        globals.add(key);
      }
    }

    // Montar lista final:
    // - Todas as globais
    // - Músicas de grupos que NÃO têm versão global (candidatas a promover)
    const seen = new Map<string, typeof songs[0]>();

    for (const song of songs) {
      const key = `${song.title.toLowerCase().trim()}||${(song.artist ?? "").toLowerCase().trim()}`;

      if (!song.groupId) {
        // Global — sempre incluir
        seen.set(key, song);
      } else if (!globals.has(key) && !seen.has(key)) {
        // De grupo sem versão global — mostrar como candidata
        seen.set(key, song);
      }
    }

    const result = Array.from(seen.values()).sort((a, b) =>
      a.title.localeCompare(b.title, "pt")
    );

    return NextResponse.json({
      songs: result.map(s => ({
        ...s,
        _group: s.group,
        group: undefined,
        needsPromotion: s.groupId !== null, // sinaliza que precisa ser promovida
      })),
      total: result.length,
      globalCount: globals.size,
    });
  } catch (err: any) {
    console.error("[songs/admin-list] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
