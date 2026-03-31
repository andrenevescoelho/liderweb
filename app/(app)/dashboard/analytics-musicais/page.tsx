"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  Music2, TrendingUp, TrendingDown, Sparkles, Users, BarChart2,
  Loader2, Lock, ArrowUpRight, ArrowDownRight, Minus,
  Globe, Home, Lightbulb, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TopSong { songId: string; title: string; artist: string | null; count: number; youtubeUrl?: string | null }
interface TrendingSong { songId: string; title: string; artist: string | null; recentCount: number; previousCount: number; growthPct: number; youtubeUrl?: string | null }
interface LocalStats {
  topSongs: TopSong[]; recentSongs: TopSong[]; neverUsedCount: number;
  totalSongs: number; totalSetlists: number; avgSongsPerSetlist: number; repeatRate: number;
}
interface GlobalStats {
  topSongs: TopSong[]; trendingSongs: TrendingSong[]; decliningeSongs: TrendingSong[];
  avgSongsPerSetlist: number; repeatRate: number;
}

function getYtThumbnail(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function SongCard({ song, rank, showGrowth }: { song: TopSong | TrendingSong; rank: number; showGrowth?: boolean }) {
  const trendSong = song as TrendingSong;
  const thumb = getYtThumbnail(song.youtubeUrl);
  return (
    <div className="flex flex-col rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-colors bg-card">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={song.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="h-10 w-10 text-muted-foreground/20" />
          </div>
        )}
        {/* Rank badge */}
        <div className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-white">
          {rank}
        </div>
        {/* Growth badge */}
        {showGrowth && trendSong.growthPct !== undefined && (
          <div className={cn(
            "absolute top-2 right-2 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            trendSong.growthPct > 0 ? "bg-emerald-500/90 text-white" : "bg-red-500/90 text-white"
          )}>
            {trendSong.growthPct > 0 ? "↑" : "↓"}{Math.abs(trendSong.growthPct)}%
          </div>
        )}
        {/* Count badge */}
        {!showGrowth && (song as TopSong).count !== undefined && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            {(song as TopSong).count}×
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm truncate">{song.title}</p>
        <p className="text-xs text-muted-foreground truncate">{song.artist ?? "Artista desconhecido"}</p>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn("text-2xl font-bold", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-500">
      <ArrowUpRight className="h-3 w-3" />+{pct}%
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500">
      <ArrowDownRight className="h-3 w-3" />{pct}%
    </span>
  );
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
}

function SongRankRow({ rank, song, showGrowth }: { rank: number; song: TopSong | TrendingSong; showGrowth?: boolean }) {
  const trendSong = song as TrendingSong;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-bold text-muted-foreground w-5 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{song.title}</p>
        {song.artist && <p className="text-xs text-muted-foreground truncate">{song.artist}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {showGrowth && trendSong.growthPct !== undefined ? (
          <TrendBadge pct={trendSong.growthPct} />
        ) : (
          <span className="text-xs font-semibold text-primary">{(song as TopSong).count}×</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge, color = "bg-primary/10 text-primary" }: {
  icon: any; title: string; badge?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", color.split(" ")[0])}>
        <Icon className={cn("h-5 w-5", color.split(" ")[1])} />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      {badge && (
        <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
          <Sparkles className="h-3 w-3" />{badge}
        </span>
      )}
    </div>
  );
}

export default function AnalyticsMusicaisPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [data, setData] = useState<{ local: LocalStats | null; global: GlobalStats; insights: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || !["ADMIN", "SUPERADMIN"].includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    fetchData();
  }, [status, user]);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/analytics-musicais");
      const json = await res.json();
      if (!res.ok) {
        setError({ code: json.error, message: json.message });
        return;
      }
      setData(json);
    } catch {
      setError({ code: "ERROR", message: "Erro ao carregar dados. Tente novamente." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading || status === "loading") return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error) {
    const isUpgrade = error.code === "UPGRADE_REQUIRED" || error.code === "PLAN_REQUIRED";
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Lock className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Premium Insights
            </span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Analytics Musicais</h1>
          <p className="text-muted-foreground">{error.message}</p>
        </div>
        {isUpgrade && (
          <Button onClick={() => router.push("/planos")}>
            <ArrowUpRight className="h-4 w-4 mr-2" /> Ver planos
          </Button>
        )}
      </div>
    );
  }

  if (!data) return null;

  const { local, global: globalData, insights } = data;

  // Preparar dados para gráficos
  const compareData = globalData.topSongs.slice(0, 6).map(gs => {
    const ls = local?.topSongs.find(s => s.songId === gs.songId);
    return {
      name: gs.title.length > 16 ? gs.title.slice(0, 16) + "…" : gs.title,
      Plataforma: gs.count,
      "Seu ministério": ls?.count ?? 0,
    };
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Analytics Musicais</h1>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Premium
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Tendências do seu ministério + plataforma</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Insights inteligentes */}
      {insights.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">Insights inteligentes</span>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SEÇÃO 1: SEU MINISTÉRIO ── */}
      {local && (
        <section>
          <SectionHeader icon={Home} title="Seu Ministério" color="bg-blue-500/10 text-blue-500" />

          {/* KPIs locais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard icon={Music2} label="Total de músicas" value={local.totalSongs} />
            <KPICard icon={BarChart2} label="Escalas criadas" value={local.totalSetlists} />
            <KPICard icon={Minus} label="Média por escala" value={local.avgSongsPerSetlist} sub="músicas" />
            <KPICard
              icon={TrendingUp}
              label="Taxa de repetição"
              value={`${local.repeatRate}%`}
              sub="músicas repetidas/mês"
              color={local.repeatRate > 60 ? "text-amber-500" : "text-primary"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top músicas locais */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Music2 className="h-4 w-4 text-blue-500" /> Top músicas mais usadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {local.topSongs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma escala criada ainda.</p>
                ) : (
                  <>
                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={local.topSongs.slice(0, 5).map(s => ({
                          name: s.title.length > 12 ? s.title.slice(0, 12) + "…" : s.title,
                          usos: s.count,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip />
                          <Bar dataKey="usos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {local.topSongs.map((s, i) => (
                      <SongRankRow key={s.songId} rank={i + 1} song={s} />
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Músicas recentes + nunca usadas */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" /> Mais usadas nos últimos 30 dias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {local.recentSongs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma escala no último mês.</p>
                  ) : local.recentSongs.map((s, i) => (
                    <SongRankRow key={s.songId} rank={i + 1} song={s} />
                  ))}
                </CardContent>
              </Card>

              <Card className={cn(local.neverUsedCount > 10 && "border-amber-500/30 bg-amber-500/5")}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                    <Music2 className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{local.neverUsedCount}</p>
                    <p className="text-xs text-muted-foreground">músicas nunca usadas em escalas</p>
                    {local.neverUsedCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Math.round((local.neverUsedCount / local.totalSongs) * 100)}% do repertório
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* ── SEÇÃO 2: TENDÊNCIAS DA PLATAFORMA ── */}
      <section>
        <SectionHeader icon={Globe} title="Tendências da Plataforma" badge="Dados globais" color="bg-violet-500/10 text-violet-500" />

        {/* KPIs globais */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <KPICard icon={BarChart2} label="Média por escala" value={globalData.avgSongsPerSetlist} sub="músicas (plataforma)" color="text-violet-500" />
          <KPICard icon={TrendingUp} label="Taxa de repetição" value={`${globalData.repeatRate}%`} sub="média global" color="text-violet-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Banner: Top músicas da semana */}
          <div className="col-span-full">
            <div className="flex items-center gap-2 mb-3">
              <Music2 className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-semibold">🔥 Músicas mais tocadas na plataforma</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {globalData.topSongs.slice(0, 5).map((s, i) => (
                <SongCard key={s.songId} song={s} rank={i + 1} />
              ))}
            </div>
          </div>

          {/* Trending */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">🚀 Em crescimento</h3>
            </div>
            {globalData.trendingSongs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem dados ainda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {globalData.trendingSongs.slice(0, 3).map((s, i) => (
                  <SongCard key={s.songId} song={s} rank={i + 1} showGrowth />
                ))}
              </div>
            )}
          </div>

          {/* Declining */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold">📉 Em queda</h3>
            </div>
            {globalData.decliningeSongs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sem dados ainda.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {globalData.decliningeSongs.slice(0, 3).map((s, i) => (
                  <SongCard key={s.songId} song={s} rank={i + 1} showGrowth />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comparativo: seu ministério vs plataforma */}
        {local && compareData.length > 0 && (
          <Card className="mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-violet-500" />
                Comparativo: Seu Ministério vs Plataforma
              </CardTitle>
              <p className="text-xs text-muted-foreground">Top músicas globais — quantas vezes cada uma foi usada</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={compareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Plataforma" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Seu ministério" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Dados globais são anônimos e agregados. Nenhuma informação sensível de outros grupos é exposta.
      </p>
    </div>
  );
}
