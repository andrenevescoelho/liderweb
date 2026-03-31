import { prisma } from "@/lib/db";

export interface TopSong {
  songId: string;
  title: string;
  artist: string | null;
  count: number;
  youtubeUrl?: string | null;
}

export interface TrendingSong {
  songId: string;
  title: string;
  artist: string | null;
  recentCount: number;
  previousCount: number;
  growthPct: number;
  youtubeUrl?: string | null;
}

export interface LocalStats {
  topSongs: TopSong[];
  neverUsedCount: number;
  totalSongs: number;
  totalSetlists: number;
  avgSongsPerSetlist: number;
  recentSongs: TopSong[];
  repeatRate: number; // % de músicas repetidas nos últimos 30 dias
}

export interface GlobalStats {
  topSongs: TopSong[];
  trendingSongs: TrendingSong[];
  decliningSongs: TrendingSong[];
  avgSongsPerSetlist: number;
  repeatRate: number;
}

export interface PlatformBenchmarks {
  avgSongsPerSetlist: number;
  avgSetlistsPerMonth: number;
  topGenres: { genre: string; count: number }[];
  totalSongs: number;
}

const THIRTY_DAYS_AGO = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const SIXTY_DAYS_AGO = () => new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
const IN_MEMORY_CACHE: Map<string, { data: any; expires: number }> = new Map();

function getCache<T>(key: string): T | null {
  const entry = IN_MEMORY_CACHE.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  return null;
}

function setCache(key: string, data: any, ttlMs = 5 * 60 * 1000) {
  IN_MEMORY_CACHE.set(key, { data, expires: Date.now() + ttlMs });
}

export async function getLocalStats(groupId: string): Promise<LocalStats> {
  const cacheKey = `local:${groupId}`;
  const cached = getCache<LocalStats>(cacheKey);
  if (cached) return cached;

  const thirtyDaysAgo = THIRTY_DAYS_AGO();

  // Top músicas mais usadas no grupo
  const topSongsRaw = await prisma.$queryRaw<TopSong[]>`
    SELECT
      s.id AS "songId",
      s.title,
      s.artist,
      s."youtubeUrl",
      COUNT(si.id)::int AS count
    FROM "SetlistItem" si
    JOIN "Song" s ON s.id = si."songId"
    JOIN "Setlist" sl ON sl.id = si."setlistId"
    WHERE sl."groupId" = ${groupId}
    GROUP BY s.id, s.title, s.artist, s."youtubeUrl"
    ORDER BY count DESC
    LIMIT 10
  `;

  // Músicas usadas nos últimos 30 dias
  const recentSongsRaw = await prisma.$queryRaw<TopSong[]>`
    SELECT
      s.id AS "songId",
      s.title,
      s.artist,
      s."youtubeUrl",
      COUNT(si.id)::int AS count
    FROM "SetlistItem" si
    JOIN "Song" s ON s.id = si."songId"
    JOIN "Setlist" sl ON sl.id = si."setlistId"
    WHERE sl."groupId" = ${groupId}
      AND sl.date >= ${thirtyDaysAgo}
    GROUP BY s.id, s.title, s.artist, s."youtubeUrl"
    ORDER BY count DESC
    LIMIT 5
  `;

  // Total de músicas do grupo
  const totalSongs = await prisma.song.count({ where: { groupId } });

  // Músicas usadas ao menos 1 vez
  const usedSongsCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT si."songId")::bigint AS count
    FROM "SetlistItem" si
    JOIN "Setlist" sl ON sl.id = si."setlistId"
    WHERE sl."groupId" = ${groupId}
  `;
  const usedCount = Number(usedSongsCount[0]?.count ?? 0);
  const neverUsedCount = Math.max(0, totalSongs - usedCount);

  // Total de setlists
  const totalSetlists = await prisma.setlist.count({ where: { groupId } });

  // Média de músicas por setlist
  const avgRaw = await prisma.$queryRaw<{ avg: number }[]>`
    SELECT COALESCE(AVG(item_count), 0)::float AS avg
    FROM (
      SELECT COUNT(si.id) AS item_count
      FROM "SetlistItem" si
      JOIN "Setlist" sl ON sl.id = si."setlistId"
      WHERE sl."groupId" = ${groupId}
      GROUP BY sl.id
    ) t
  `;
  const avgSongsPerSetlist = Number(avgRaw[0]?.avg ?? 0);

  // Taxa de repetição (músicas repetidas / total últimos 30 dias)
  const repeatRaw = await prisma.$queryRaw<{ repeated: bigint; total: bigint }[]>`
    SELECT
      COUNT(CASE WHEN cnt > 1 THEN 1 END)::bigint AS repeated,
      COUNT(*)::bigint AS total
    FROM (
      SELECT si."songId", COUNT(*) AS cnt
      FROM "SetlistItem" si
      JOIN "Setlist" sl ON sl.id = si."setlistId"
      WHERE sl."groupId" = ${groupId}
        AND sl.date >= ${thirtyDaysAgo}
      GROUP BY si."songId"
    ) t
  `;
  const repeatRate = repeatRaw[0]?.total > 0
    ? Math.round((Number(repeatRaw[0].repeated) / Number(repeatRaw[0].total)) * 100)
    : 0;

  const result: LocalStats = {
    topSongs: topSongsRaw,
    recentSongs: recentSongsRaw,
    neverUsedCount,
    totalSongs,
    totalSetlists,
    avgSongsPerSetlist: Math.round(avgSongsPerSetlist * 10) / 10,
    repeatRate,
  };

  setCache(cacheKey, result, 3 * 60 * 1000); // 3 min
  return result;
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const cacheKey = "global:stats";
  const cached = getCache<GlobalStats>(cacheKey);
  if (cached) return cached;

  const thirtyDaysAgo = THIRTY_DAYS_AGO();
  const sixtyDaysAgo = SIXTY_DAYS_AGO();

  // Top músicas globais
  const topSongsRaw = await prisma.$queryRaw<TopSong[]>`
    SELECT
      s.id AS "songId",
      s.title,
      s.artist,
      s."youtubeUrl",
      COUNT(si.id)::int AS count
    FROM "SetlistItem" si
    JOIN "Song" s ON s.id = si."songId"
    JOIN "Setlist" sl ON sl.id = si."setlistId"
    WHERE sl."groupId" IS NOT NULL
    GROUP BY s.id, s.title, s.artist, s."youtubeUrl"
    ORDER BY count DESC
    LIMIT 10
  `;

  // Trending: músicas que cresceram nos últimos 30 dias vs 30 anteriores
  const trendingRaw = await prisma.$queryRaw<{
    songId: string; title: string; artist: string | null;
    recent: bigint; previous: bigint;
  }[]>`
    SELECT
      s.id AS "songId",
      s.title,
      s.artist,
      COUNT(CASE WHEN sl.date >= ${thirtyDaysAgo} THEN 1 END)::bigint AS recent,
      COUNT(CASE WHEN sl.date >= ${sixtyDaysAgo} AND sl.date < ${thirtyDaysAgo} THEN 1 END)::bigint AS previous
    FROM "SetlistItem" si
    JOIN "Song" s ON s.id = si."songId"
    JOIN "Setlist" sl ON sl.id = si."setlistId"
    WHERE sl."groupId" IS NOT NULL
      AND sl.date >= ${sixtyDaysAgo}
    GROUP BY s.id, s.title, s.artist
    HAVING COUNT(CASE WHEN sl.date >= ${thirtyDaysAgo} THEN 1 END) >= 2
    ORDER BY recent DESC
    LIMIT 50
  `;

  // Calcular crescimento
  const withGrowth = trendingRaw
    .map(row => {
      const recent = Number(row.recent);
      const previous = Number(row.previous);
      const growthPct = previous === 0
        ? (recent > 0 ? 100 : 0)
        : Math.round(((recent - previous) / previous) * 100);
      return { songId: row.songId, title: row.title, artist: row.artist, recentCount: recent, previousCount: previous, growthPct };
    });

  const trendingSongs = withGrowth
    .filter(s => s.growthPct > 0)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 5);

  const decliningeSongs = withGrowth
    .filter(s => s.growthPct < 0)
    .sort((a, b) => a.growthPct - b.growthPct)
    .slice(0, 5);

  // Média global de músicas por setlist
  const avgRaw = await prisma.$queryRaw<{ avg: number }[]>`
    SELECT COALESCE(AVG(item_count), 0)::float AS avg
    FROM (
      SELECT COUNT(si.id) AS item_count
      FROM "SetlistItem" si
      JOIN "Setlist" sl ON sl.id = si."setlistId"
      WHERE sl."groupId" IS NOT NULL
      GROUP BY sl.id
    ) t
  `;

  // Taxa de repetição global
  const repeatRaw = await prisma.$queryRaw<{ repeated: bigint; total: bigint }[]>`
    SELECT
      COUNT(CASE WHEN cnt > 1 THEN 1 END)::bigint AS repeated,
      COUNT(*)::bigint AS total
    FROM (
      SELECT si."songId", sl."groupId", COUNT(*) AS cnt
      FROM "SetlistItem" si
      JOIN "Setlist" sl ON sl.id = si."setlistId"
      WHERE sl."groupId" IS NOT NULL
        AND sl.date >= ${thirtyDaysAgo}
      GROUP BY si."songId", sl."groupId"
    ) t
  `;
  const repeatRate = repeatRaw[0]?.total > 0
    ? Math.round((Number(repeatRaw[0].repeated) / Number(repeatRaw[0].total)) * 100)
    : 0;

  const result: GlobalStats = {
    topSongs: topSongsRaw,
    trendingSongs,
    decliningeSongs,
    avgSongsPerSetlist: Math.round(Number(avgRaw[0]?.avg ?? 0) * 10) / 10,
    repeatRate,
  };

  setCache(cacheKey, result, 10 * 60 * 1000); // 10 min
  return result;
}

export function generateInsights(local: LocalStats, global: GlobalStats): string[] {
  const insights: string[] = [];

  // Repetição vs média
  if (local.repeatRate > global.repeatRate + 15) {
    insights.push(`Você repete músicas mais que a média da plataforma (${local.repeatRate}% vs ${global.repeatRate}%). Considere renovar o repertório.`);
  } else if (local.repeatRate < global.repeatRate - 15) {
    insights.push(`Seu ministério tem um repertório muito variado! Você repete menos que a média (${local.repeatRate}% vs ${global.repeatRate}%).`);
  }

  // Músicas nunca usadas
  if (local.neverUsedCount > 0 && local.totalSongs > 0) {
    const pct = Math.round((local.neverUsedCount / local.totalSongs) * 100);
    if (pct > 40) {
      insights.push(`${pct}% das suas músicas (${local.neverUsedCount}) nunca foram usadas em escalas. Que tal explorá-las?`);
    }
  }

  // Músicas em alta que o grupo não usa
  const localSongIds = new Set(local.topSongs.map(s => s.songId));
  const trendingNotUsed = global.trendingSongs.filter(s => !localSongIds.has(s.songId));
  if (trendingNotUsed.length > 0) {
    insights.push(`"${trendingNotUsed[0].title}" está em alta na plataforma (+${trendingNotUsed[0].growthPct}%) e você ainda não a usa.`);
  }

  // Média de músicas por setlist
  if (local.avgSongsPerSetlist > 0 && global.avgSongsPerSetlist > 0) {
    const diff = local.avgSongsPerSetlist - global.avgSongsPerSetlist;
    if (diff > 2) {
      insights.push(`Suas escalas têm em média ${local.avgSongsPerSetlist} músicas — mais que a média da plataforma (${global.avgSongsPerSetlist}).`);
    } else if (diff < -2) {
      insights.push(`Suas escalas têm em média ${local.avgSongsPerSetlist} músicas — menos que a média da plataforma (${global.avgSongsPerSetlist}).`);
    }
  }

  // Engajamento
  if (local.totalSetlists === 0) {
    insights.push("Você ainda não criou escalas. Comece agora para desbloquear análises do seu ministério!");
  }

  return insights.slice(0, 4);
}
