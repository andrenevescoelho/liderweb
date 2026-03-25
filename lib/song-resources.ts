import { prisma } from "@/lib/db";

export type SongResourceType = "cifra" | "youtube" | "audio" | "multitrack" | "pad";

export interface SongResource {
  type: SongResourceType;
  available: boolean;
  // dados extras quando disponível
  multitrackAlbumId?: string;
  multitrackRentalStatus?: "ACTIVE" | "EXPIRED" | "NOT_RENTED";
  padBoardId?: string;
  url?: string;
}

export interface SongResources {
  cifra: SongResource;
  youtube: SongResource;
  audio: SongResource;
  multitrack: SongResource;
  pad: SongResource;
  // botão primário sugerido para ensaio
  primaryAction: "multitrack" | "youtube" | "audio" | "none";
}

/**
 * Resolve todos os recursos disponíveis para uma música.
 * Busca multitrack por songId (vínculo direto) ou por title+artist (fuzzy fallback).
 * Busca pad por songId ou por musicalKey fuzzy.
 */
export async function getSongResources(
  songId: string,
  groupId: string
): Promise<SongResources> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      artist: true,
      originalKey: true,
      chordPro: true,
      chordUrl: true,
      audioUrl: true,
      youtubeUrl: true,
      multitracks: {
        where: { isActive: true, status: "READY" },
        select: {
          id: true,
          rentals: {
            where: { groupId, status: "ACTIVE" },
            select: { id: true, status: true },
            take: 1,
          },
        },
        take: 1,
      },
      padBoards: {
        where: { isActive: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!song) throw new Error("Música não encontrada");

  // Multitrack: primeiro tenta vínculo direto, depois busca por título+artista
  let multitrackAlbumId: string | undefined;
  let multitrackRentalStatus: SongResource["multitrackRentalStatus"] = "NOT_RENTED";

  if (song.multitracks.length > 0) {
    multitrackAlbumId = song.multitracks[0].id;
    multitrackRentalStatus = song.multitracks[0].rentals.length > 0 ? "ACTIVE" : "NOT_RENTED";
  } else {
    // Fallback: busca por título similar
    const fuzzyAlbum = await prisma.multitracksAlbum.findFirst({
      where: {
        isActive: true,
        status: "READY",
        OR: [
          { title: { contains: song.title, mode: "insensitive" } },
          { title: { equals: song.title, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        rentals: {
          where: { groupId, status: "ACTIVE" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (fuzzyAlbum) {
      multitrackAlbumId = fuzzyAlbum.id;
      multitrackRentalStatus = fuzzyAlbum.rentals.length > 0 ? "ACTIVE" : "NOT_RENTED";
    }
  }

  // Pad: vínculo direto ou fallback por musicalKey
  let padBoardId: string | undefined;
  if (song.padBoards.length > 0) {
    padBoardId = song.padBoards[0].id;
  } else {
    const fuzzyPad = await prisma.padBoard.findFirst({
      where: {
        isActive: true,
        musicalKey: { equals: song.originalKey, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (fuzzyPad) padBoardId = fuzzyPad.id;
  }

  const hasCifra = Boolean(song.chordPro || song.chordUrl);
  const hasYoutube = Boolean(song.youtubeUrl);
  const hasAudio = Boolean(song.audioUrl);
  const hasMultitrack = Boolean(multitrackAlbumId);
  const hasPad = Boolean(padBoardId);

  const primaryAction: SongResources["primaryAction"] = hasMultitrack
    ? "multitrack"
    : hasYoutube
    ? "youtube"
    : hasAudio
    ? "audio"
    : "none";

  return {
    cifra: { type: "cifra", available: hasCifra },
    youtube: { type: "youtube", available: hasYoutube, url: song.youtubeUrl ?? undefined },
    audio: { type: "audio", available: hasAudio, url: song.audioUrl ?? undefined },
    multitrack: {
      type: "multitrack",
      available: hasMultitrack,
      multitrackAlbumId,
      multitrackRentalStatus,
    },
    pad: { type: "pad", available: hasPad, padBoardId },
    primaryAction,
  };
}

/**
 * Versão batch — resolve recursos de várias músicas de uma vez.
 * Usado na listagem de músicas para não fazer N queries.
 */
export async function getSongResourcesBatch(
  songIds: string[],
  groupId: string
): Promise<Record<string, SongResources>> {
  if (songIds.length === 0) return {};

  const songs = await prisma.song.findMany({
    where: { id: { in: songIds } },
    select: {
      id: true,
      title: true,
      originalKey: true,
      chordPro: true,
      chordUrl: true,
      audioUrl: true,
      youtubeUrl: true,
      multitracks: {
        where: { isActive: true, status: "READY" },
        select: {
          id: true,
          rentals: {
            where: { groupId, status: "ACTIVE" },
            select: { id: true },
            take: 1,
          },
        },
        take: 1,
      },
      padBoards: {
        where: { isActive: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  // Busca fuzzy de multitracks para músicas sem vínculo direto
  const songsWithoutMultitrack = songs.filter((s) => s.multitracks.length === 0);
  const fuzzyTitles = songsWithoutMultitrack.map((s) => s.title);
  const fuzzyAlbums = fuzzyTitles.length > 0
    ? await prisma.multitracksAlbum.findMany({
        where: {
          isActive: true,
          status: "READY",
          title: { in: fuzzyTitles, mode: "insensitive" } as any,
        },
        select: {
          id: true,
          title: true,
          rentals: {
            where: { groupId, status: "ACTIVE" },
            select: { id: true },
            take: 1,
          },
        },
      })
    : [];

  const result: Record<string, SongResources> = {};

  for (const song of songs) {
    let multitrackAlbumId: string | undefined;
    let multitrackRentalStatus: SongResource["multitrackRentalStatus"] = "NOT_RENTED";

    if (song.multitracks.length > 0) {
      multitrackAlbumId = song.multitracks[0].id;
      multitrackRentalStatus = song.multitracks[0].rentals.length > 0 ? "ACTIVE" : "NOT_RENTED";
    } else {
      const match = fuzzyAlbums.find(
        (a) => a.title.toLowerCase() === song.title.toLowerCase()
      );
      if (match) {
        multitrackAlbumId = match.id;
        multitrackRentalStatus = match.rentals.length > 0 ? "ACTIVE" : "NOT_RENTED";
      }
    }

    const padBoardId = song.padBoards[0]?.id;
    const hasCifra = Boolean(song.chordPro || song.chordUrl);
    const hasYoutube = Boolean(song.youtubeUrl);
    const hasAudio = Boolean(song.audioUrl);
    const hasMultitrack = Boolean(multitrackAlbumId);
    const hasPad = Boolean(padBoardId);

    const primaryAction: SongResources["primaryAction"] = hasMultitrack
      ? "multitrack"
      : hasYoutube
      ? "youtube"
      : hasAudio
      ? "audio"
      : "none";

    result[song.id] = {
      cifra: { type: "cifra", available: hasCifra },
      youtube: { type: "youtube", available: hasYoutube, url: song.youtubeUrl ?? undefined },
      audio: { type: "audio", available: hasAudio, url: song.audioUrl ?? undefined },
      multitrack: { type: "multitrack", available: hasMultitrack, multitrackAlbumId, multitrackRentalStatus },
      pad: { type: "pad", available: hasPad, padBoardId },
      primaryAction,
    };
  }

  return result;
}
