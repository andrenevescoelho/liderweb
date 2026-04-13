export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET — listar todas as músicas (SUPERADMIN)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const limit  = Number(searchParams.get("limit") ?? 200);

    const songs = await prisma.song.findMany({
      where: search ? {
        OR: [
          { title:  { contains: search, mode: "insensitive" } },
          { artist: { contains: search, mode: "insensitive" } },
        ],
      } : {},
      orderBy: { title: "asc" },
      take: limit,
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

    return NextResponse.json({
      songs: songs.map(s => ({
        ...s,
        _group: s.group,
        group: undefined,
      })),
      total: songs.length,
    });
  } catch (err: any) {
    console.error("[songs/admin-list] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
