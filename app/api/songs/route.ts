export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { enqueueSongAnalysis } from "@/lib/song-analysis";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

function sanitizeChordUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const canViewMultitrack =
      user.role === "SUPERADMIN" || hasPermission(user.role, "multitrack.view", user.permissions);
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

      const page = parseInt(searchParams?.get?.("page") ?? "1") || 1;
      const take = 30;
      const skip = (page - 1) * take;

      const [songs, total] = await Promise.all([
        prisma.song.findMany({
          where,
          orderBy: { title: "asc" },
          take,
          skip,
          select: {
            id: true,
            title: true,
            artist: true,
            bpm: true,
            originalKey: true,
            timeSignature: true,
            tags: true,
          },
        }),
        prisma.song.count({ where }),
      ]);

      return NextResponse.json({
        songs: songs ?? [],
        total,
        page,
        pages: Math.ceil(total / take),
      });
    }

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

    const artist = searchParams?.get?.("artist");
    if (artist) {
      where.artist = { contains: artist, mode: "insensitive" };
    }

    const songs = await prisma.song.findMany({
      where,
      orderBy: { title: "asc" },
      include: {
        padBoards: {
          where: { isActive: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    // Buscar multitracks por título (case-insensitive) OU por songId
    // Isso garante que todos os grupos veem multitracks mesmo que a música
    // tenha sido criada por outro grupo e vinculada por título
    let multitracksMap: Record<string, { id: string; rentals?: any[] }> = {};
    if (canViewMultitrack && songs.length > 0) {
      const titles = [...new Set(songs.map((s: any) => s.title))];
      const songIds = songs.map((s: any) => s.id);
      const albums = await (prisma as any).multitracksAlbum.findMany({
        where: {
          isActive: true,
          status: { in: ["READY", "CATALOGED", "DOWNLOADING"] },
          OR: [
            { songId: { in: songIds } },
            { title: { in: titles } },
          ],
        },
        select: {
          id: true,
          title: true,
          songId: true,
          rentals: user.groupId ? {
            where: { groupId: user.groupId, status: "ACTIVE" },
            select: { id: true },
            take: 1,
          } : false,
        },
      });

      // Mapear por songId primeiro, depois por título normalizado
      const normalizeTitle = (t: string) =>
        t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

      for (const album of albums) {
        // Índice por songId
        if (album.songId) {
          multitracksMap[album.songId] = album;
        }
        // Índice por título normalizado
        const key = `title:${normalizeTitle(album.title)}`;
        if (!multitracksMap[key]) {
          multitracksMap[key] = album;
        }
      }
    }

    const songsWithResources = songs.map((song: any) => {
      // Tentar encontrar multitrack pelo songId ou pelo título
      const normalizeTitle = (t: string) =>
        t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

      const album = multitracksMap[song.id] ||
        multitracksMap[`title:${normalizeTitle(song.title)}`];

      const hasMultitrack = canViewMultitrack && Boolean(album);
      const multitrackRented = hasMultitrack && (album?.rentals?.length ?? 0) > 0;
      return {
        ...song,
        resources: {
          cifra: Boolean(song.chordPro || song.chordUrl),
          youtube: Boolean(song.youtubeUrl),
          audio: Boolean(song.audioUrl),
          multitrack: hasMultitrack,
          multitrackAlbumId: hasMultitrack ? (album?.id ?? null) : null,
          multitrackRented,
          pad: song.padBoards.length > 0,
          padBoardId: song.padBoards[0]?.id ?? null,
        },
      };
    });

    // Buscar artistas únicos para o filtro
    const artists = [...new Set(
      songsWithResources.map((s: any) => s.artist).filter(Boolean)
    )].sort() as string[];

    return NextResponse.json({
      songs: songsWithResources ?? [],
      total: songsWithResources.length,
      artists,
    });
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

    if (userRole !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Usuário não pertence a nenhum grupo" }, { status: 400 });
    }

    const body = await req.json();
    const context = extractRequestContext(req);
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
      chordUrl,
    } = body ?? {};

    const sanitizedChordUrl = sanitizeChordUrl(chordUrl);

    if (chordUrl && !sanitizedChordUrl) {
      return NextResponse.json({ error: "Link da cifra inválido. Use URL com http:// ou https://" }, { status: 400 });
    }

    if (sourceSongId) {
      const sourceSong = await prisma.song.findUnique({ where: { id: sourceSongId } });

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
          chordUrl: sourceSong.chordUrl,
          audioUrl: sourceSong.audioUrl,
          youtubeUrl: sourceSong.youtubeUrl,
          sourceType: sourceSong.sourceType,
          analysisStatus: sourceSong.analysisStatus,
          analysisError: sourceSong.analysisError,
          bpmDetected: sourceSong.bpmDetected,
          keyDetected: sourceSong.keyDetected,
          modeDetected: sourceSong.modeDetected,
          confidenceBpm: sourceSong.confidenceBpm,
          confidenceKey: sourceSong.confidenceKey,
          groupId: user.groupId ?? null,
        },
      });

      await logUserAction({
        userId: user.id,
        groupId: user.groupId ?? null,
        action: AUDIT_ACTIONS.SONG_CREATED,
        entityType: AuditEntityType.SONG,
        entityId: clonedSong.id,
        entityName: clonedSong.title,
        description: `Usuário ${user.name} importou a música ${clonedSong.title}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { sourceSongId },
      });

      return NextResponse.json(clonedSong);
    }

    if (!title) {
      return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
    }

    const hasAnalysisSource = Boolean(audioUrl || youtubeUrl);

    const song = await prisma.song.create({
      data: {
        title,
        artist: artist ?? null,
        bpm: bpm ? parseInt(bpm) : null,
        originalKey: originalKey ?? "C",
        timeSignature: timeSignature ?? "4/4",
        tags: tags ?? [],
        lyrics: lyrics ?? null,
        chordPro: chordPro ?? null,
        chordUrl: sanitizedChordUrl,
        audioUrl: audioUrl ?? null,
        youtubeUrl: youtubeUrl ?? null,
        sourceType: youtubeUrl ? "YOUTUBE" : audioUrl ? "UPLOAD" : null,
        analysisStatus: hasAnalysisSource ? "PENDING" : "FAILED",
        analysisError: hasAnalysisSource ? null : "Nenhuma fonte de áudio para análise automática.",
        bpmUserOverride: bpm ? parseInt(bpm) : null,
        keyUserOverride: originalKey ?? null,
        groupId: user.groupId ?? null,
      },
    });

    if (hasAnalysisSource) {
      await enqueueSongAnalysis(song.id);
    }

    await logUserAction({
      userId: user.id,
      groupId: user.groupId ?? null,
      action: AUDIT_ACTIONS.SONG_CREATED,
      entityType: AuditEntityType.SONG,
      entityId: song.id,
      entityName: song.title,
      description: `Usuário ${user.name} criou a música ${song.title}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      newValues: { title: song.title, artist: song.artist, bpm: song.bpm, originalKey: song.originalKey },
    });

    return NextResponse.json(song);
  } catch (error) {
    console.error("Create song error:", error);
    return NextResponse.json({ error: "Erro ao criar música" }, { status: 500 });
  }
}
