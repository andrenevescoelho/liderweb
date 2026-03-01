export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const searchParams = req?.nextUrl?.searchParams;
    const search = searchParams?.get?.("search");
    const tag = searchParams?.get?.("tag");
    const key = searchParams?.get?.("key");
    const library = searchParams?.get?.("library");

    const where: any = {};

    if (library === "community") {
      if (user.role !== "SUPERADMIN" && !user.groupId) {
        return NextResponse.json([]);
      }

      where.groupId = user.role === "SUPERADMIN" ? { not: null } : { not: user.groupId };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { artist: { contains: search, mode: "insensitive" } },
        ];
      }

      const songs = await prisma.song.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 20,
      });

      return NextResponse.json(songs ?? []);
    }

    // SuperAdmin vê todas, outros veem apenas do seu grupo
    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) {
        return NextResponse.json([]);
      }
      where.groupId = user.groupId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { artist: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tag) {
      where.tags = { has: tag };
    }
    if (key) {
      where.originalKey = key;
    }

    const songs = await prisma.song.findMany({
      where,
      orderBy: { title: "asc" },
    });

    return NextResponse.json(songs ?? []);
  } catch (error) {
    console.error("Get songs error:", error);
    return NextResponse.json({ error: "Erro ao buscar músicas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userRole = user?.role ?? "MEMBER";

    if (!session || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const canCreateSong =
      userRole === "SUPERADMIN" ||
      userRole === "ADMIN" ||
      userRole === "LEADER" ||
      hasPermission(userRole, "music.rehearsal.send", user?.permissions);

    if (!canCreateSong) {
      return NextResponse.json({ error: "Sem permissão para criar músicas" }, { status: 403 });
    }

    // Usuário precisa ter um grupo (exceto SuperAdmin)
    if (userRole !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Usuário não pertence a nenhum grupo" }, { status: 400 });
    }

    const body = await req.json();
    const {
      title,
      artist,
      bpm,
      originalKey,
      timeSignature,
      tags,
      lyrics,
      chordPro,
      audioUrl,
      youtubeUrl,
      sourceSongId,
    } = body ?? {};

    if (sourceSongId) {
      const sourceSong = await prisma.song.findUnique({
        where: { id: sourceSongId },
      });

      if (!sourceSong) {
        return NextResponse.json({ error: "Música de origem não encontrada" }, { status: 404 });
      }

      if (userRole !== "SUPERADMIN" && sourceSong.groupId === user.groupId) {
        return NextResponse.json({ error: "Esta música já pertence ao seu grupo" }, { status: 400 });
      }

      const duplicatedSong = await prisma.song.findFirst({
        where: {
          groupId: user.groupId ?? null,
          title: sourceSong.title,
          artist: sourceSong.artist,
        },
      });

      if (duplicatedSong) {
        return NextResponse.json(
          { error: "Essa música já existe no repertório do seu grupo", song: duplicatedSong },
          { status: 409 }
        );
      }

      const clonedSong = await prisma.song.create({
        data: {
          title: sourceSong.title,
          artist: sourceSong.artist,
          bpm: sourceSong.bpm,
          originalKey: sourceSong.originalKey,
          timeSignature: sourceSong.timeSignature,
          tags: sourceSong.tags,
          lyrics: sourceSong.lyrics,
          chordPro: sourceSong.chordPro,
          audioUrl: sourceSong.audioUrl,
          youtubeUrl: sourceSong.youtubeUrl,
          groupId: user.groupId ?? null,
        },
      });

      return NextResponse.json(clonedSong);
    }

    if (!title || !originalKey) {
      return NextResponse.json(
        { error: "Título e tom original são obrigatórios" },
        { status: 400 }
      );
    }

    const song = await prisma.song.create({
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
        groupId: user.groupId ?? null,
      },
    });

    return NextResponse.json(song);
  } catch (error) {
    console.error("Create song error:", error);
    return NextResponse.json({ error: "Erro ao criar música" }, { status: 500 });
  }
}
