"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Heart, TrendingUp, AlertTriangle, Star, RefreshCw } from "lucide-react";
import Link from "next/link";

const CRITERIA_LABELS: Record<string, string> = {
  afinacao: "Afinação",
  tecnicaVocal: "Técnica vocal",
  dominioInstrumental: "Domínio instrumental",
  conhecimentoMusical: "Conhecimento musical",
  pontualidade: "Pontualidade",
  comprometimento: "Comprometimento",
};

const MOOD_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  MUITO_MAL:  { label: "Muito mal",  emoji: "😞", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  DESANIMADO: { label: "Desanimado", emoji: "😕", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  NEUTRO:     { label: "Neutro",     emoji: "😐", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  BEM:        { label: "Bem",        emoji: "🙂", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  MOTIVADO:   { label: "Motivado",   emoji: "🔥", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
};

const LEVEL_COLORS: Record<number, string> = {
  1: "text-orange-600",
  2: "text-yellow-600",
  3: "text-green-600",
  4: "text-blue-600",
  5: "text-purple-600",
};

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() ?? "?";
  const colors = ["bg-purple-100 text-purple-700", "bg-blue-100 text-blue-700", "bg-green-100 text-green-700", "bg-orange-100 text-orange-700", "bg-teal-100 text-teal-700"];
  const color = colors[name?.charCodeAt(0) % colors.length] ?? colors[0];
  return (
    <div className={`rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${color}`} style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

export default function MinisterioPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user as any;
  const [tab, setTab] = useState<"overview" | "development" | "health">("overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const canAccess = ["SUPERADMIN", "ADMIN", "LEADER"].includes(user?.role ?? "");

  useEffect(() => {
    if (session && !canAccess) router.replace("/dashboard");
  }, [session, canAccess]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/ministerio/dashboard");
      const d = await res.json();
      setData(d);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { if (canAccess) fetchData(); }, [canAccess]);

  if (!canAccess) return null;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  const { members = [], groupCriteriaAvg = {}, attentionNeeded = [], moodSummary = {}, stats = {} } = data ?? {};

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Painel do Ministério</h1>
          <p className="text-sm text-muted-foreground">Desenvolvimento e saúde da equipe</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
        {[
          { key: "overview", label: "Visão geral", icon: <Users className="h-3.5 w-3.5" /> },
          { key: "development", label: "Desenvolvimento", icon: <TrendingUp className="h-3.5 w-3.5" /> },
          { key: "health", label: "Saúde emocional", icon: <Heart className="h-3.5 w-3.5" /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md transition-colors ${tab === t.key ? "bg-background text-foreground font-medium shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* VISÃO GERAL */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Membros", value: stats.totalMembers ?? 0, color: "" },
              { label: "Média de desenvolvimento", value: stats.avgGroupScore ? stats.avgGroupScore.toFixed(1) + "/5" : "—", color: "text-green-600" },
              { label: "Bem ou motivados hoje", value: stats.positivePercent !== null ? stats.positivePercent + "%" : "—", color: "text-green-600" },
              { label: "Precisam atenção", value: stats.attentionCount ?? 0, color: stats.attentionCount > 0 ? "text-orange-600" : "" },
            ].map((m, i) => (
              <div key={i} className="bg-muted/40 rounded-lg p-3 text-center">
                <p className={`text-2xl font-medium ${m.color}`}>{m.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
              </div>
            ))}
          </div>

          {attentionNeeded.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Atenção necessária
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {attentionNeeded.map((a: any) => (
                  <div key={a.memberId} className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10">
                    <Avatar name={a.name} size={34} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">{a.reason}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 flex-shrink-0 text-xs">
                      Cuidar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Membros</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/50">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <Avatar name={m.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      {m.level && (
                        <span className={`text-xs font-medium ${LEVEL_COLORS[m.level]}`}>
                          Nível {m.level}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.functions?.join(", ") || m.role}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {m.lastMood && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${MOOD_LABELS[m.lastMood]?.color ?? ""}`}>
                        {MOOD_LABELS[m.lastMood]?.emoji}
                      </span>
                    )}
                    {m.avgScore !== null && (
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(n => (
                          <span key={n} className={`text-xs ${n <= Math.round(m.avgScore) ? "text-yellow-400" : "text-muted-foreground/20"}`}>★</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* DESENVOLVIMENTO */}
      {tab === "development" && (
        <>
          {Object.keys(groupCriteriaAvg).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Média do grupo por critério
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(groupCriteriaAvg).map(([key, val]) => {
                  const v = val as number;
                  return (
                    <div key={key}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{CRITERIA_LABELS[key] ?? key}</span>
                        <span className="text-xs font-medium">{v.toFixed(1)}/5</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${v >= 4 ? "bg-green-500" : v >= 3 ? "bg-blue-500" : "bg-orange-500"}`}
                          style={{ width: `${(v / 5) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Evolução individual</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/50">
              {members.map((m: any) => (
                <div key={m.id} className="py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar name={m.name} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{m.name}</p>
                        {m.levelLabel && (
                          <span className={`text-xs font-medium ${LEVEL_COLORS[m.level]}`}>
                            Nível {m.level} — {m.levelLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.functions?.join(", ") || "—"}</p>
                    </div>
                    {m.avgScore !== null ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(n => (
                            <span key={n} className={`text-sm ${n <= Math.round(m.avgScore) ? "text-yellow-400" : "text-muted-foreground/20"}`}>★</span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{m.avgScore.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground flex-shrink-0">Sem avaliação</span>
                    )}
                  </div>
                  {m.evaluation && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 ml-[46px]">
                      {Object.entries(m.evaluation).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${(val as number) >= 4 ? "bg-green-500" : (val as number) >= 3 ? "bg-blue-400" : "bg-orange-400"}`}
                              style={{ width: `${((val as number) / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-20 truncate">{CRITERIA_LABELS[key] ?? key}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* SAÚDE EMOCIONAL */}
      {tab === "health" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-medium text-green-600">{moodSummary.positivePercent !== null ? moodSummary.positivePercent + "%" : "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">Bem ou motivados</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className={`text-2xl font-medium ${attentionNeeded.length > 0 ? "text-orange-600" : ""}`}>{attentionNeeded.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Precisam atenção</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-2xl font-medium">{moodSummary.checkedInToday ?? 0}/{moodSummary.totalMembers ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">Check-ins hoje</p>
            </div>
          </div>

          {attentionNeeded.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Radar de atenção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {attentionNeeded.map((a: any) => (
                  <div key={a.memberId} className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10">
                    <Avatar name={a.name} size={34} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">{a.reason}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 text-xs flex-shrink-0">
                      Cuidar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Estado do time hoje</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/50">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <Avatar name={m.name} size={34} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    {m.moodHistory?.length > 1 && (
                      <div className="flex gap-1 mt-0.5">
                        {m.moodHistory.slice(0, 7).map((mood: string, i: number) => (
                          <span key={i} className="text-xs">{MOOD_LABELS[mood]?.emoji ?? "—"}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {m.lastMood ? (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${MOOD_LABELS[m.lastMood]?.color ?? ""}`}>
                        {MOOD_LABELS[m.lastMood]?.emoji} {MOOD_LABELS[m.lastMood]?.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem check-in</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
