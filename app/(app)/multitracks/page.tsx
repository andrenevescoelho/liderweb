"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { ModuleAccessOverlay } from "@/components/module-access-overlay";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Music2, Search, Play, Lock, Loader2, CheckCircle2, Clock, Layers,
  LayoutGrid, Grid2x2, List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Stem { name: string }

interface Album {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  coverUrl: string | null;
  description: string | null;
  stemCount: number;
  createdAt?: string | null;
  rented: boolean;
  expiresAt: string | null;
}

interface Usage {
  count: number;
  limit: number;
}

export default function MultitracksPage() {
  const { data: session, status } = useSession() || {};
  const { t } = useI18n();
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [usage, setUsage] = useState<Usage>({ count: 0, limit: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterArtist, setFilterArtist] = useState("");
  const [filterRented, setFilterRented] = useState(false);
  const [sortBy, setSortBy] = useState<"title"|"artist"|"recent"|"bpm"|"stems"|"expiry">("title");
  const [sortAsc, setSortAsc] = useState(true);
  const [renting, setRenting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // albumId em download
  const [blockedByPlan, setBlockedByPlan] = useState(false);
  const [blockedByPermission, setBlockedByPermission] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [canRent, setCanRent] = useState(false);
  const [viewMode, setViewMode] = useState<"large" | "small" | "list">("large");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchAlbums = useCallback(async (q = "") => {
    try {
      setLoading(true);
      const res = await fetch(`/api/multitracks?q=${encodeURIComponent(q)}`);
      if (res.status === 403) {
        setBlockedByPermission(true);
        setAlbums([]);
        return;
      }
      if (res.status === 402) {
        setBlockedByPlan(true);
        setAlbums([]);
        setUsage({ count: 0, limit: 0 });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAlbums(data.albums || []);
        setUsage(data.usage || { count: 0, limit: 0 });
        const rentAllowed = data.canRent ?? false;
        setCanRent(rentAllowed);
        setBlockedByPlan(!rentAllowed);
        // Cota esgotada: tem acesso ao plano mas usou tudo
        const u = data.usage || { count: 0, limit: 0 };
        setQuotaExceeded(rentAllowed && u.limit > 0 && u.count >= u.limit);
      }
    } catch {
      toast.error("Erro ao carregar multitracks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAlbums();
  }, [status, fetchAlbums]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAlbums(search);
  };

  const handleRent = async (albumId: string) => {
    // Se cota esgotada, ir para o carrinho
    if (quotaExceeded) {
      await addToCartAndRedirect(albumId);
      return;
    }
    setRenting(albumId);
    try {
      const res = await fetch("/api/multitracks/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "QUOTA_EXCEEDED") {
          setQuotaExceeded(true);
          toast.error("Cota mensal esgotada. Adicione cotas extras no carrinho.");
        } else {
          toast.error(data.error || "Erro ao alugar");
        }
        return;
      }
      if (res.status === 202 && data.downloading) {
        // Album ainda sendo baixado — iniciar polling
        toast.success("Preparando sua multitrack... Isso pode levar alguns minutos.");
        setDownloading(albumId);
        fetchAlbums(search);
        pollDownloadStatus(albumId, data.pollUrl);
        return;
      }
      toast.success("Multitrack alugada! Clique em Abrir Player para ouvir.");
      fetchAlbums(search);
    } catch {
      toast.error("Erro ao alugar multitrack");
    } finally {
      setRenting(null);
    }
  };

  const pollDownloadStatus = async (albumId: string, pollUrl: string) => {
    const maxAttempts = 40; // ~10 minutos (15s * 40)
    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      try {
        const res = await fetch(pollUrl);
        const data = await res.json();
        if (data.status === "READY" || data.albumStatus === "READY") {
          clearInterval(interval);
          setDownloading(null);
          fetchAlbums(search);
          toast.success("Multitrack pronta! Clique em Abrir Player.");
          return;
        }
        if (data.status === "ERROR" || data.albumStatus === "ERROR") {
          clearInterval(interval);
          setDownloading(null);
          toast.error("Erro ao preparar multitrack. Tente novamente.");
          return;
        }
      } catch {
        // silencioso — continua tentando
      }
      if (attempt >= maxAttempts) {
        clearInterval(interval);
        setDownloading(null);
        toast.error("Tempo esgotado. Tente abrir o player novamente em alguns minutos.");
      }
    }, 15000); // polling a cada 15s
  };

  const addToCartAndRedirect = async (albumId?: string) => {
    try {
      const prodRes = await fetch("/api/billing/products?type=MULTITRACK_RENTAL");
      if (!prodRes.ok) { toast.error("Produto não disponível"); return; }
      const prodData = await prodRes.json();
      const product = prodData.products?.[0];
      if (!product) { toast.error("Produto avulso não encontrado"); return; }

      const cartRes = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          productId: product.id,
          quantity: 1,
          metadata: albumId ? { albumId } : {},
        }),
      });
      if (!cartRes.ok) {
        const err = await cartRes.json();
        toast.error(`Erro ao adicionar ao carrinho: ${err.error || cartRes.status}`);
        return;
      }
      router.push("/cart");
    } catch (err: any) {
      toast.error(`Erro: ${err?.message || "desconhecido"}`);
    }
  };

  const handlePlay = (albumId: string) => {
    router.push(`/multitracks/${albumId}`);
  };

  const handleBuyAvulso = async (albumId?: string) => {
    await addToCartAndRedirect(albumId);
  };

  const daysLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-w-0 overflow-x-hidden">
      <div className={cn("space-y-6", blockedByPlan && "opacity-35 pointer-events-none select-none")}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Music2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Multitracks</h1>
            <p className="text-sm text-muted-foreground">Acervo de multitracks para seu ministério</p>
          </div>
        </div>
        {/* Cota */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
          <Layers className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Cotas do mês</p>
            <p className="text-sm font-semibold">
              <span className={cn(usage.count >= usage.limit ? "text-red-400" : "text-primary")}>
                {usage.count}
              </span>
              <span className="text-muted-foreground">/{usage.limit}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Banner cota esgotada */}
      {quotaExceeded && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Cota mensal esgotada ({usage.count}/{usage.limit})
            </p>
            <p className="text-xs text-muted-foreground">
              Alugue cotas extras por R$ 9,90 cada. Clique em qualquer track para adicionar ao carrinho.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => router.push("/cart")}
            className="flex-shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
            Ver carrinho
          </Button>
        </div>
      )}

      {/* Total de multitracks */}
      {!loading && albums.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{albums.length}</span>
          <span>{albums.length === 1 ? "multitrack disponível" : "multitracks disponíveis"}</span>
        </div>
      )}

      {/* Busca */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("multitracks.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      {/* Filtros + view mode */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro Artista */}
          <select
            value={filterArtist}
            onChange={(e) => setFilterArtist(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">Todos os artistas</option>
            {Array.from(new Set(albums.map(a => a.artist).filter(Boolean))).sort().map(artist => (
              <option key={artist} value={artist!}>{artist}</option>
            ))}
          </select>
          {/* Filtro Alugadas */}
          <button
            onClick={() => setFilterRented(v => !v)}
            className={cn(
              "h-9 flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all",
              filterRented
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Alugadas
            {filterRented && albums.filter(a => a.rented).length > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold">
                {albums.filter(a => a.rented).length}
              </span>
            )}
          </button>
        </div>
        {/* Ordenação */}
        <div className="flex items-center gap-1 flex-wrap">
          {([
            { key: "title",  label: "A–Z"        },
            { key: "artist", label: t("multitracks.sortArtist")     },
            { key: "recent", label: t("multitracks.sortRecent")    },
            { key: "bpm",    label: "BPM"         },
            { key: "stems",  label: "Stems"       },
            { key: "expiry", label: t("multitracks.sortExpiry")      },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => {
                if (sortBy === opt.key) setSortAsc(v => !v);
                else { setSortBy(opt.key); setSortAsc(true); }
              }}
              className={cn(
                "h-8 flex items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-all",
                sortBy === opt.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}>
              {opt.label}
              {sortBy === opt.key && (
                <span className="text-[10px]">{sortAsc ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
        </div>

        {/* View mode */}
        <div className="flex items-center rounded-xl border border-border bg-muted/30 p-1 gap-0.5">
          <button onClick={() => setViewMode("large")}
            className={cn("p-1.5 rounded-lg transition-colors", viewMode === "large" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            title="Ícones grandes"><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("small")}
            className={cn("p-1.5 rounded-lg transition-colors", viewMode === "small" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            title="Ícones pequenos"><Grid2x2 className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded-lg transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            title="Lista"><List className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Grid de álbuns */}
      {(() => {
        const filtered = albums
          .filter(a =>
            (!filterArtist || a.artist === filterArtist) &&
            (!filterRented || a.rented)
          )
          .sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
              case "title":  cmp = a.title.localeCompare(b.title, "pt"); break;
              case "artist": cmp = (a.artist ?? "").localeCompare(b.artist ?? "", "pt"); break;
              case "recent": cmp = new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(); break;
              case "bpm":    cmp = (b.bpm ?? 0) - (a.bpm ?? 0); break;
              case "stems":  cmp = (b.stemCount ?? 0) - (a.stemCount ?? 0); break;
              case "expiry":
                if (!a.rented && !b.rented) cmp = 0;
                else if (!a.rented) cmp = 1;
                else if (!b.rented) cmp = -1;
                else cmp = new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime();
                break;
            }
            return sortAsc ? cmp : -cmp;
          });
        return filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhuma multitrack encontrada.</p>
        </div>
      ) : viewMode === "list" ? (
        /* ── MODO LISTA ── */
        <div className="divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
          {filtered.map((album) => (
            <div key={album.id} className={cn("flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors", album.rented && "bg-primary/5")}>
              {/* Capa pequena */}
              <div className="relative h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {album.coverUrl
                  ? <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music2 className="h-5 w-5 text-muted-foreground/20" /></div>}
                {album.rented && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-primary" /></div>}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{album.title}</p>
                <p className="text-xs text-muted-foreground truncate">{album.artist}</p>
              </div>
              {/* Tags */}
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                {album.bpm && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{album.bpm} BPM</span>}
                {album.musicalKey && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Tom {album.musicalKey}</span>}
                {album.genre && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{album.genre}</span>}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{album.stemCount} stems</span>
                {album.rented && album.expiresAt && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock className="h-3 w-3" />{daysLeft(album.expiresAt)}d</span>}
              </div>
              {/* Botão */}
              <div className="flex-shrink-0">
                {album.rented ? (
                  <Button size="sm" onClick={() => handlePlay(album.id)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />Abrir
                  </Button>
                ) : quotaExceeded ? (
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleRent(album.id)}>
                    <Lock className="mr-1.5 h-3.5 w-3.5" />R$ 9,90
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleRent(album.id)} disabled={renting === album.id || downloading === album.id || !canRent}>
                    {renting === album.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : downloading === album.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Preparando...</> : <><Lock className="mr-1.5 h-3.5 w-3.5" />Alugar</>}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── MODO GRID (LARGE / SMALL) ── */
        <div className={cn("grid gap-4", viewMode === "large"
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8")}>
          {filtered.map((album) => (
            <Card key={album.id} className={cn("overflow-hidden transition-all hover:border-primary/30", album.rented && "border-primary/20")}>
              {/* Capa */}
              <div className="relative aspect-square bg-muted overflow-hidden">
                {album.coverUrl ? (
                  <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className={cn("text-muted-foreground/20", viewMode === "large" ? "h-16 w-16" : "h-8 w-8")} />
                  </div>
                )}
                {album.rented && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <CheckCircle2 className="h-3 w-3" />
                    {viewMode === "large" && t("multitracks.rentedBadge")}
                  </div>
                )}
                {album.rented && album.expiresAt && viewMode === "large" && (
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <Clock className="h-3 w-3" />{daysLeft(album.expiresAt)}d
                  </div>
                )}
              </div>

              <CardContent className={cn(viewMode === "large" ? "p-4" : "p-2")}>
                <h3 className={cn("font-semibold truncate", viewMode === "small" && "text-xs")}>{album.title}</h3>
                <p className={cn("text-muted-foreground truncate", viewMode === "large" ? "text-sm mb-2" : "text-[10px] mb-1.5")}>{album.artist}</p>

                {viewMode === "large" && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {album.bpm && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{album.bpm} BPM</span>}
                    {album.musicalKey && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Tom {album.musicalKey}</span>}
                    {album.genre && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{album.genre}</span>}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{album.stemCount} stems</span>
                  </div>
                )}

                {album.rented ? (
                  <Button size="sm" className="w-full" onClick={() => handlePlay(album.id)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />{viewMode === "large" ? "Abrir Player" : "Abrir"}
                  </Button>
                ) : quotaExceeded ? (
                  <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleRent(album.id)}>
                    <Lock className="mr-1.5 h-3.5 w-3.5" />{viewMode === "large" ? "Alugar — R$ 9,90" : "R$ 9,90"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => handleRent(album.id)} disabled={renting === album.id || !canRent}>
                    {renting === album.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <><Lock className="mr-1.5 h-3.5 w-3.5" />{viewMode === "large" ? t("multitracks.rent") : "Alugar"}</>}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      );
      })()}
      </div>
      {blockedByPermission && (
        <ModuleAccessOverlay
          moduleLabel="Visualizar catálogo de multitracks"
          isAdmin={false}
          permissionDenied={true}
        />
      )}
      {blockedByPlan && (
        <ModuleAccessOverlay
          moduleLabel={t("multitracks.title")}
          isAdmin={user?.role === "ADMIN" || user?.role === "SUPERADMIN"}
          onUpgrade={() => router.push("/planos")}
        />
      )}
    </div>
  );
}
