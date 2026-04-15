"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Scissors, Users, Calendar, Building2, Loader2,
  Download, Search, RefreshCw, CheckCircle2, Clock,
  XCircle, AlertTriangle, Music2, ChevronDown, ChevronUp,
  Globe, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SplitJob {
  id: string;
  songName: string;
  artistName: string | null;
  status: string;
  fileName: string;
  fileSizeBytes: number | null;
  durationSec: number | null;
  bpm: number | null;
  musicalKey: string | null;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  metadata?: { isPublic?: boolean; priceInCents?: number } | null;
  group: { id: string; name: string };
  user:  { id: string; name: string | null; email: string };
  stems: { id: string; label: string; displayName: string; type: string }[];
}

interface Stats {
  total:     number;
  byStatus:  Record<string, number>;
  thisMonth: number;
  topGroups: { groupId: string; name: string; count: number }[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  DONE:       { label: "Concluído",    icon: CheckCircle2,   color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  PROCESSING: { label: "Processando", icon: Clock,          color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  PENDING:    { label: "Aguardando",  icon: Clock,          color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  ANALYZING:  { label: "Analisando",  icon: Clock,          color: "text-purple-500 bg-purple-500/10 border-purple-500/20" },
  GENERATING: { label: "Gerando",     icon: Clock,          color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20" },
  ERROR:      { label: "Erro",        icon: XCircle,        color: "text-red-500 bg-red-500/10 border-red-500/20" },
  CANCELED:   { label: "Cancelado",   icon: XCircle,        color: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: AlertTriangle, color: "text-muted-foreground bg-muted border-border" };
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export default function SplitAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [jobs, setJobs]         = useState<SplitJob[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [togglingPublic, setTogglingPublic] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || user.role !== "SUPERADMIN") { router.replace("/dashboard"); return; }
    fetchJobs();
  }, [status, user]);

  const fetchJobs = async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      const res = await fetch(`/api/splits/admin?${params}`);
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setStats(data.stats ?? null);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  const togglePublic = async (job: SplitJob) => {
    setTogglingPublic(job.id);
    try {
      const isPublic = !job.metadata?.isPublic;
      await fetch("/api/splits/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, isPublic }),
      });
      setJobs(prev => prev.map(j => j.id === job.id
        ? { ...j, metadata: { ...j.metadata, isPublic, priceInCents: 490 } }
        : j
      ));
    } finally { setTogglingPublic(null); }
  };

  const handleExportCSV = () => {
    const header = "ID,Música,Artista,Grupo,Usuário,Status,BPM,Tom,Duração,Tamanho,Stems,Data\n";
    const rows = filtered.map(j =>
      `"${j.id}","${j.songName}","${j.artistName ?? ""}","${j.group.name}","${j.user.name ?? j.user.email}","${j.status}","${j.bpm ?? ""}","${j.musicalKey ?? ""}","${formatDuration(j.durationSec)}","${formatSize(j.fileSizeBytes)}","${j.stems.length}","${formatDate(j.createdAt)}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `splits-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = jobs.filter(j =>
    (!search || j.songName.toLowerCase().includes(search.toLowerCase()) ||
     (j.artistName ?? "").toLowerCase().includes(search.toLowerCase()) ||
     j.group.name.toLowerCase().includes(search.toLowerCase()) ||
     (j.user.name ?? "").toLowerCase().includes(search.toLowerCase())) &&
    (!filterStatus || j.status === filterStatus)
  );

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Scissors className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Split — Histórico</h1>
            <p className="text-sm text-muted-foreground">
              Todas as ações de split realizadas na plataforma
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Scissors className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <p className="text-2xl font-bold">{stats.byStatus.DONE ?? 0 + (stats.byStatus.ERROR ?? 0) + (stats.byStatus.PENDING ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <p className="text-xs text-muted-foreground">Concluídos</p>
            </div>
            <p className="text-2xl font-bold">{stats.byStatus.DONE ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Este mês</p>
            </div>
            <p className="text-2xl font-bold">{stats.thisMonth}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Erros</p>
            </div>
            <p className="text-2xl font-bold">{stats.byStatus.ERROR ?? 0}</p>
          </div>
        </div>
      )}

      {/* Top grupos */}
      {stats?.topGroups && stats.topGroups.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/10 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Top grupos
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.topGroups.map(g => (
              <div key={g.groupId} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs">
                <span className="font-medium">{g.name}</span>
                <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por música, artista, grupo..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-border">
          <Scissors className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground text-sm">Nenhum split encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(job => {
            const isExpanded = expanded === job.id;
            const isPublic = job.metadata?.isPublic ?? false;
            return (
              <div key={job.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Linha principal */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{job.songName}</p>
                      {job.artistName && <span className="text-xs text-muted-foreground">— {job.artistName}</span>}
                      <StatusBadge status={job.status} />
                      {isPublic && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                          <Globe className="h-3 w-3" /> Acervo R$4,90
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />{job.group.name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />{job.user.name ?? job.user.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{formatDate(job.createdAt)}
                      </span>
                      {job.stems.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Music2 className="h-3 w-3" />{job.stems.length} stems
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Botão acervo — só para splits DONE */}
                    {job.status === "DONE" && (
                      <Button variant="ghost" size="sm"
                        onClick={() => togglePublic(job)}
                        disabled={togglingPublic === job.id}
                        className={cn("h-7 px-2 text-[10px] font-semibold gap-1",
                          isPublic
                            ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            : "text-muted-foreground hover:text-foreground"
                        )}>
                        {togglingPublic === job.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : isPublic ? <><Globe className="h-3 w-3" />No acervo</> : <><Lock className="h-3 w-3" />Acervo</>
                        }
                      </Button>
                    )}
                    <button onClick={() => setExpanded(isExpanded ? null : job.id)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div><p className="text-muted-foreground mb-0.5">Arquivo</p><p className="font-medium truncate">{job.fileName}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">Tamanho</p><p className="font-medium">{formatSize(job.fileSizeBytes)}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">Duração</p><p className="font-medium">{formatDuration(job.durationSec)}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">BPM / Tom</p><p className="font-medium">{job.bpm ?? "—"} / {job.musicalKey ?? "—"}</p></div>
                    </div>
                    {job.stems.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Stems gerados:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {job.stems.map(s => (
                            <span key={s.id} className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium">
                              {s.displayName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {job.errorMessage && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                        <p className="font-semibold mb-0.5">Erro:</p>
                        <p>{job.errorMessage}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">ID: {job.id}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">{filtered.length} de {jobs.length} registros</p>
    </div>
  );
}
