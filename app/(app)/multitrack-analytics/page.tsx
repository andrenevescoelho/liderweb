"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Music, Users, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Overview { totalRentals: number; activeRentals: number; totalGroups: number; period: string; }
interface TopTrack { album: { id: string; title: string; artist: string; coverUrl: string | null } | undefined; count: number; }
interface GroupStat { groupId: string; groupName: string; count: number; subscriptionStatus: string; trialEndsAt: string | null; }
interface Suspect {
  groupId: string; groupName: string; groupCreatedAt: string;
  adminName: string; adminEmail: string; lastLogin: string | null;
  subscriptionStatus: string; trialEndsAt: string | null; trialDaysLeft: number | null;
  totalRentals: number; rentals: { rentedAt: string; expiresAt: string; status: string }[];
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  sameEmailDomainGroups: { id: string; name: string }[];
}
interface Timeline { date: string; count: number; }

interface AnalyticsData {
  overview: Overview;
  topTracks: TopTrack[];
  byGroup: GroupStat[];
  suspectedAbusers: Suspect[];
  timeline: Timeline[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Ativo", TRIALING: "Trial", CANCELED: "Cancelado",
  PAST_DUE: "Em atraso", NO_SUBSCRIPTION: "Sem assinatura",
};

const RISK_CONFIG = {
  HIGH: { label: "Alto risco", color: "text-red-500 bg-red-500/10" },
  MEDIUM: { label: "Médio risco", color: "text-yellow-500 bg-yellow-500/10" },
  LOW: { label: "Baixo risco", color: "text-green-500 bg-green-500/10" },
};

export default function MultitrackAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [groupFilter, setGroupFilter] = useState("");
  const [expandedSuspect, setExpandedSuspect] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "suspects">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      const res = await fetch(`/api/admin/multitrack-analytics?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxCount = data?.timeline.reduce((a, b) => Math.max(a, b.count), 0) ?? 1;
  const filteredGroups = data?.byGroup.filter(g =>
    g.groupName.toLowerCase().includes(groupFilter.toLowerCase())
  ) ?? [];

  const highRisk = data?.suspectedAbusers.filter(s => s.riskLevel === "HIGH").length ?? 0;
  const mediumRisk = data?.suspectedAbusers.filter(s => s.riskLevel === "MEDIUM").length ?? 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics de Multitracks</h1>
          <p className="text-sm text-muted-foreground mt-1">Aluguéis, tendências e detector de abuso de trial</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
          <button onClick={fetchData} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando...</div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground">Erro ao carregar dados</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total de aluguéis", value: data.overview.totalRentals, icon: <Music className="h-5 w-5 text-purple-500" />, color: "text-purple-500" },
              { label: "Aluguéis ativos", value: data.overview.activeRentals, icon: <TrendingUp className="h-5 w-5 text-green-500" />, color: "text-green-500" },
              { label: "Ministérios", value: data.overview.totalGroups, icon: <Users className="h-5 w-5 text-blue-500" />, color: "text-blue-500" },
              { label: "Suspeitos de abuso", value: data.suspectedAbusers.length, icon: <AlertTriangle className="h-5 w-5 text-red-500" />, color: highRisk > 0 ? "text-red-500" : "text-yellow-500" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">{s.icon}<span className="text-xs text-muted-foreground">{data.overview.period}</span></div>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {[{ key: "overview", label: "Visão Geral" }, { key: "suspects", label: `Detector de Abuso ${data.suspectedAbusers.length > 0 ? `(${data.suspectedAbusers.length})` : ""}` }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Aba Visão Geral ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Timeline */}
              {data.timeline.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="h-4 w-4 text-purple-500" />Aluguéis por dia</h2>
                  <div className="flex items-end gap-1 h-32">
                    {data.timeline.map(d => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                          {format(new Date(d.date), "dd/MM", { locale: ptBR })}: {d.count}
                        </div>
                        <div className="w-full bg-purple-500 rounded-t-sm transition-all"
                          style={{ height: `${Math.max(4, (d.count / maxCount) * 100)}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>{data.timeline[0]?.date ? format(new Date(data.timeline[0].date), "dd/MM", { locale: ptBR }) : ""}</span>
                    <span>{data.timeline[data.timeline.length - 1]?.date ? format(new Date(data.timeline[data.timeline.length - 1].date), "dd/MM", { locale: ptBR }) : ""}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Tracks */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="font-semibold mb-4 flex items-center gap-2"><Music className="h-4 w-4 text-purple-500" />Top tracks mais alugadas</h2>
                  <div className="space-y-3">
                    {data.topTracks.map((t, i) => (
                      <div key={t.album?.id ?? i} className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                        {t.album?.coverUrl ? (
                          <img src={t.album.coverUrl} alt={t.album.title} className="h-10 w-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Music className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{t.album?.title ?? "Desconhecido"}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.album?.artist}</p>
                        </div>
                        <span className="text-sm font-bold text-purple-500 flex-shrink-0">{t.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Por ministério */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" />Por ministério</h2>
                  <input type="text" placeholder="Filtrar ministério..." value={groupFilter}
                    onChange={e => setGroupFilter(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredGroups.map(g => (
                      <div key={g.groupId} className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{g.groupName}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            g.subscriptionStatus === "ACTIVE" ? "bg-green-500/10 text-green-500" :
                            g.subscriptionStatus === "TRIALING" ? "bg-yellow-500/10 text-yellow-500" :
                            "bg-muted text-muted-foreground"
                          }`}>{STATUS_LABEL[g.subscriptionStatus] ?? g.subscriptionStatus}</span>
                        </div>
                        <span className="text-sm font-bold text-blue-500 flex-shrink-0">{g.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Detector de Abuso ── */}
          {tab === "suspects" && (
            <div className="space-y-4">
              {highRisk > 0 || mediumRisk > 0 ? (
                <div className="rounded-xl bg-red-50 border border-red-200 dark:bg-red-900/10 dark:border-red-800 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800 dark:text-red-200">Possível abuso de trial detectado</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {highRisk > 0 && <span><strong>{highRisk}</strong> grupos de alto risco. </span>}
                      {mediumRisk > 0 && <span><strong>{mediumRisk}</strong> grupos de médio risco.</span>}
                      {" "}Grupos em trial que alugaram multitracks e podem estar usando o ciclo trial → aluguel → novo email.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/10 p-4 text-center text-green-700 dark:text-green-300 text-sm">
                  ✅ Nenhum padrão suspeito detectado no período
                </div>
              )}

              <div className="space-y-2">
                {data.suspectedAbusers.map(s => {
                  const risk = RISK_CONFIG[s.riskLevel];
                  return (
                    <div key={s.groupId} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20"
                        onClick={() => setExpandedSuspect(expandedSuspect === s.groupId ? null : s.groupId)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{s.groupName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.color}`}>{risk.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              s.subscriptionStatus === "TRIALING" ? "bg-yellow-500/10 text-yellow-500" : "bg-muted text-muted-foreground"
                            }`}>{STATUS_LABEL[s.subscriptionStatus] ?? s.subscriptionStatus}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                            <span>{s.adminEmail}</span>
                            <span>{s.totalRentals} aluguel(ns)</span>
                            {s.trialDaysLeft !== null && <span>{s.trialDaysLeft > 0 ? `Trial: ${s.trialDaysLeft} dias restantes` : "Trial expirado"}</span>}
                            {s.sameEmailDomainGroups.length > 0 && <span className="text-red-500">⚠ {s.sameEmailDomainGroups.length} grupo(s) com mesmo domínio de email</span>}
                          </div>
                        </div>
                        {expandedSuspect === s.groupId ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                      </div>

                      {expandedSuspect === s.groupId && (
                        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-muted-foreground">Admin</p><p className="font-medium">{s.adminName}</p></div>
                            <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium truncate">{s.adminEmail}</p></div>
                            <div><p className="text-xs text-muted-foreground">Grupo criado</p><p className="font-medium">{format(new Date(s.groupCreatedAt), "dd/MM/yyyy", { locale: ptBR })}</p></div>
                            <div><p className="text-xs text-muted-foreground">Último acesso</p><p className="font-medium">{s.lastLogin ? formatDistanceToNow(new Date(s.lastLogin), { locale: ptBR, addSuffix: true }) : "Nunca"}</p></div>
                          </div>

                          {s.sameEmailDomainGroups.length > 0 && (
                            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-3">
                              <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">⚠ Outros grupos com mesmo domínio de email:</p>
                              <div className="flex flex-wrap gap-2">
                                {s.sameEmailDomainGroups.map(g => (
                                  <span key={g.id} className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">{g.name}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Histórico de aluguéis:</p>
                            <div className="space-y-1">
                              {s.rentals.map((r, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Aluguel #{i + 1} — {format(new Date(r.rentedAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                                  <span>Expira: {format(new Date(r.expiresAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                                  <span className={r.status === "ACTIVE" && new Date(r.expiresAt) > new Date() ? "text-green-500" : "text-muted-foreground"}>{r.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
