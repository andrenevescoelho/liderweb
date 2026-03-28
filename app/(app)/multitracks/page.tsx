"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { ModuleAccessOverlay } from "@/components/module-access-overlay";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Music2, Search, Play, Lock, Loader2, CheckCircle2, Clock, Layers,
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
  rented: boolean;
  expiresAt: string | null;
}

interface Usage {
  count: number;
  limit: number;
}

export default function MultitracksPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [usage, setUsage] = useState<Usage>({ count: 0, limit: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [renting, setRenting] = useState<string | null>(null);
  const [blockedByPlan, setBlockedByPlan] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const fetchAlbums = useCallback(async (q = "") => {
    try {
      setLoading(true);
      const res = await fetch(`/api/multitracks?q=${encodeURIComponent(q)}`);
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
        setBlockedByPlan(!rentAllowed);
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
          toast.error(data.error);
        } else {
          toast.error(data.error || "Erro ao alugar");
        }
        return;
      }
      toast.success("Multitrack alugada! Abrindo player...");
      fetchAlbums(search);
      setTimeout(() => router.push(`/multitracks/${albumId}`), 1000);
    } catch {
      toast.error("Erro ao alugar multitrack");
    } finally {
      setRenting(null);
    }
  };

  const handlePlay = (albumId: string) => {
    router.push(`/multitracks/${albumId}`);
  };

  const handleBuyAvulso = async (albumId?: string) => {
    try {
      // Buscar produto avulso de multitrack
      const prodRes = await fetch("/api/billing/products?type=MULTITRACK_RENTAL");
      if (!prodRes.ok) {
        toast.error(`Erro ao buscar produto (${prodRes.status})`);
        return;
      }
      const prodData = await prodRes.json();
      const product = prodData.products?.[0];
      if (!product) {
        toast.error("Produto avulso não disponível no momento. Entre em contato com o suporte.");
        return;
      }

      // Adicionar ao carrinho
      const cartAddRes = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          productId: product.id,
          quantity: 1,
          metadata: albumId ? { albumId } : {},
        }),
      });
      const cartAddData = await cartAddRes.json();
      if (!cartAddRes.ok) {
        toast.error(`Erro ao adicionar ao carrinho: ${cartAddData.error || cartAddRes.status}`);
        return;
      }

      // Checkout direto
      const checkoutRes = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkout" }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        toast.error(`Erro ao iniciar checkout: ${checkoutData.error || checkoutRes.status}`);
        return;
      }
      if (checkoutData.url) {
        window.location.href = checkoutData.url;
      } else {
        toast.error("Checkout não retornou URL. Tente novamente.");
      }
    } catch (err: any) {
      toast.error(`Erro inesperado: ${err?.message || "desconhecido"}`);
    }
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
    <div className="relative">
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

      {/* Busca */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou artista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      {/* Grid de álbuns */}
      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhuma multitrack encontrada.</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <Card key={album.id} className={cn("overflow-hidden transition-all hover:border-primary/30", album.rented && "border-primary/20")}>
              {/* Capa */}
              <div className="relative aspect-square bg-muted overflow-hidden">
                {album.coverUrl ? (
                  <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className="h-16 w-16 text-muted-foreground/20" />
                  </div>
                )}
                {album.rented && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-1 text-[10px] font-semibold text-primary-foreground">
                    <CheckCircle2 className="h-3 w-3" />
                    Alugada
                  </div>
                )}
                {album.rented && album.expiresAt && (
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
                    <Clock className="h-3 w-3" />
                    {daysLeft(album.expiresAt)}d restantes
                  </div>
                )}
              </div>

              <CardContent className="p-4">
                <h3 className="font-semibold truncate">{album.title}</h3>
                <p className="text-sm text-muted-foreground truncate mb-2">{album.artist}</p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {album.bpm && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {album.bpm} BPM
                    </span>
                  )}
                  {album.musicalKey && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Tom {album.musicalKey}
                    </span>
                  )}
                  {album.genre && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {album.genre}
                    </span>
                  )}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {album.stemCount} stems
                  </span>
                </div>

                {album.rented ? (
                  <Button size="sm" className="w-full" onClick={() => handlePlay(album.id)}>
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Abrir Player
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleRent(album.id)}
                    disabled={renting === album.id || usage.count >= usage.limit}
                  >
                    {renting === album.id ? (
                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Alugando...</>
                    ) : usage.count >= usage.limit ? (
                      <><Lock className="mr-2 h-3.5 w-3.5" />Cota esgotada</>
                    ) : (
                      <><Lock className="mr-2 h-3.5 w-3.5" />Alugar (cota)</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
      {blockedByPlan && (
        <ModuleAccessOverlay
          moduleLabel="Multitracks"
          isAdmin={user?.role === "ADMIN" || user?.role === "SUPERADMIN"}
          onUpgrade={() => router.push("/planos")}
          onBuyAvulso={handleBuyAvulso}
          avulsoLabel="Comprar avulso"
          avulsoPrice="R$ 9,90"
        />
      )}
    </div>
  );
}
