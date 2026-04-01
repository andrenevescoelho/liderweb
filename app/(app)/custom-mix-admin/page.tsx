"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Sliders, BarChart2, Music2, Users, Calendar, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RecentMix {
  id: string; name: string; createdAt: string;
  album: { title: string; artist: string };
  group: { name: string };
  user: { name: string };
}

export default function CustomMixAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || user.role !== "SUPERADMIN") { router.replace("/dashboard"); return; }
    fetchData();
  }, [status, user]);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch("/api/custom-mix/admin");
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); setRefreshing(false); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Sliders className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Custom Mix — Admin</h1>
            <p className="text-sm text-muted-foreground">Estatísticas globais de mixes criados</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><BarChart2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{data?.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total de mixes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Calendar className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{data?.thisMonth ?? 0}</p>
              <p className="text-xs text-muted-foreground">Criados este mês</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{data?.totalGroups ?? 0}</p>
              <p className="text-xs text-muted-foreground">Ministérios usando</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top multitracks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Music2 className="h-4 w-4 text-primary" /> Multitracks mais mixadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.byAlbum ?? []).map((row: any, i: number) => (
              <div key={row.albumId} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.artist}</p>
                </div>
                <span className="text-xs font-semibold text-primary">{row.count}×</span>
              </div>
            ))}
            {(data?.byAlbum ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sem dados ainda.</p>}
          </CardContent>
        </Card>

        {/* Top grupos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Ministérios mais ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.byGroup ?? []).map((row: any, i: number) => (
              <div key={row.groupId} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-bold text-muted-foreground w-5 text-center">{i + 1}</span>
                <p className="text-sm font-medium flex-1 truncate">{row.groupName}</p>
                <span className="text-xs font-semibold text-primary">{row.count} mixes</span>
              </div>
            ))}
            {(data?.byGroup ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sem dados ainda.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Mixes recentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Mixes recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Mix</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Multitrack</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Ministério</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Usuário</th>
                  <th className="pb-2 text-xs font-semibold text-muted-foreground">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(data?.recent ?? []).map((mix: RecentMix) => (
                  <tr key={mix.id} className="hover:bg-muted/20">
                    <td className="py-2.5 pr-4 font-medium truncate max-w-[160px]">{mix.name}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[140px]">{mix.album.title}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[120px]">{mix.group.name}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground truncate max-w-[100px]">{mix.user.name}</td>
                    <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(mix.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.recent ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum mix criado ainda.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
