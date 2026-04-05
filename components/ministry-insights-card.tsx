"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Info, CheckCircle2, Users, Music,
  Calendar, GraduationCap, TrendingUp, TrendingDown,
  Minus, ChevronRight, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Alert {
  type: "warning" | "info" | "success";
  message: string;
}

interface InsightsData {
  alerts: Alert[];
  team: {
    total: number;
    withoutServing: string[];
    topLoad: { name: string; count: number }[];
    overloaded: { name: string; count: number } | null;
  };
  repertoire: {
    total: number;
    newThisMonth: number;
    unusedSixMonths: string[];
  };
  schedules: {
    thisMonth: number;
    prevMonth: number;
    trend: number | null;
    byMonth: { month: string; count: number }[];
    pendingConfirmations: number;
  };
  coach: {
    enabled: number;
    total: number;
    avgLevel: number | null;
    practicesThisMonth: number;
  };
}

function AlertIcon({ type }: { type: Alert["type"] }) {
  if (type === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />;
  if (type === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />;
  return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />;
}

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) return null;
  if (trend > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-green-500 font-semibold">
      <TrendingUp className="w-3 h-3" /> +{trend}%
    </span>
  );
  if (trend < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-400 font-semibold">
      <TrendingDown className="w-3 h-3" /> {trend}%
    </span>
  );
  return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="w-3 h-3" /> igual</span>;
}

function MiniBarChart({ data }: { data: { month: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-12 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-full flex items-end justify-center" style={{ height: "32px" }}>
            <div
              className="w-full rounded-sm bg-primary/60 transition-all"
              style={{ height: d.count > 0 ? `${Math.max((d.count / max) * 32, 4)}px` : "2px", opacity: d.count > 0 ? 1 : 0.2 }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.month}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      {action}
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-foreground leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</div>
    </div>
  );
}

export function MinistryInsightsCard() {
  const router = useRouter();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/insights")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="rounded-xl border border-border/80">
        <CardContent className="flex items-center justify-center h-24">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const coachCoverage = data.coach.total > 0
    ? Math.round((data.coach.enabled / data.coach.total) * 100)
    : 0;

  return (
    <div className="space-y-3">

      {/* Alertas */}
      {data.alerts.length > 0 && (
        <Card className="rounded-xl border border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">Atenção do líder</span>
            </div>
            <div className="space-y-2">
              {data.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertIcon type={alert.type} />
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid de métricas — 4 colunas iguais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Equipe */}
        <Card className="rounded-xl border border-border/80 col-span-1">
          <CardContent className="p-4">
            <SectionHeader
              icon={<Users className="w-3.5 h-3.5" />}
              title="Equipe"
            />
            <div className="flex items-end gap-3 mb-3">
              <Stat value={data.team.total} label="membros" />
              {data.team.withoutServing.length > 0 && (
                <Stat value={data.team.withoutServing.length} label="sem escalar" />
              )}
              {data.team.topLoad[0] && (
                <Stat value={data.team.topLoad[0].count} label="escalas (top)" />
              )}
            </div>
            {data.team.withoutServing.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">Sem participar (30d):</p>
                <div className="flex flex-wrap gap-1">
                  {data.team.withoutServing.slice(0, 3).map((name, i) => (
                    <span key={i} className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                      {name.split(" ")[0]}
                    </span>
                  ))}
                  {data.team.withoutServing.length > 3 && (
                    <span className="text-[11px] text-muted-foreground">+{data.team.withoutServing.length - 3}</span>
                  )}
                </div>
              </div>
            )}
            <button onClick={() => router.push("/members")} className="flex items-center gap-1 text-xs text-primary hover:underline mt-auto">
              Ver membros <ChevronRight className="w-3 h-3" />
            </button>
          </CardContent>
        </Card>

        {/* Escalas */}
        <Card className="rounded-xl border border-border/80 col-span-1">
          <CardContent className="p-4">
            <SectionHeader
              icon={<Calendar className="w-3.5 h-3.5" />}
              title="Escalas"
              action={<TrendBadge trend={data.schedules.trend} />}
            />
            <div className="flex items-end gap-3 mb-3">
              <Stat value={data.schedules.thisMonth} label="este mês" />
              {data.schedules.pendingConfirmations > 0 && (
                <Stat value={data.schedules.pendingConfirmations} label="pendentes" />
              )}
            </div>
            {data.schedules.byMonth.length > 0 && (
              <div className="mb-3">
                <MiniBarChart data={data.schedules.byMonth} />
              </div>
            )}
            <button onClick={() => router.push("/schedules")} className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver escalas <ChevronRight className="w-3 h-3" />
            </button>
          </CardContent>
        </Card>

        {/* Repertório */}
        <Card className="rounded-xl border border-border/80 col-span-1">
          <CardContent className="p-4">
            <SectionHeader icon={<Music className="w-3.5 h-3.5" />} title="Repertório" />
            <div className="flex items-end gap-3 mb-3">
              <Stat value={data.repertoire.total} label="músicas" />
              {data.repertoire.newThisMonth > 0 && (
                <Stat value={`+${data.repertoire.newThisMonth}`} label="novas" />
              )}
              {data.repertoire.unusedSixMonths.length > 0 && (
                <Stat value={data.repertoire.unusedSixMonths.length} label="sem uso" />
              )}
            </div>
            {data.repertoire.unusedSixMonths.length > 0 && (
              <p className="text-[11px] text-muted-foreground mb-3">
                {data.repertoire.unusedSixMonths.slice(0, 2).join(", ")}
                {data.repertoire.unusedSixMonths.length > 2 && ` +${data.repertoire.unusedSixMonths.length - 2}`}
                {" "}sem uso há 6 meses
              </p>
            )}
            <button onClick={() => router.push("/songs")} className="flex items-center gap-1 text-xs text-primary hover:underline">
              Ver músicas <ChevronRight className="w-3 h-3" />
            </button>
          </CardContent>
        </Card>

        {/* Professor IA */}
        <Card className="rounded-xl border border-border/80 col-span-1">
          <CardContent className="p-4">
            <SectionHeader icon={<GraduationCap className="w-3.5 h-3.5" />} title="Professor IA" />
            {data.coach.total > 0 ? (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <Stat value={`${data.coach.enabled}/${data.coach.total}`} label="com acesso" />
                  {data.coach.practicesThisMonth > 0 && (
                    <Stat value={data.coach.practicesThisMonth} label="práticas" />
                  )}
                  {data.coach.avgLevel && (
                    <Stat value={data.coach.avgLevel} label="nível médio" />
                  )}
                </div>
                {coachCoverage < 100 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">Cobertura</span>
                      <span className="text-[11px] font-medium text-primary">{coachCoverage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coachCoverage}%` }} />
                    </div>
                  </div>
                )}
                <button onClick={() => router.push("/professor-config")} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Configurar <ChevronRight className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Professor IA não configurado.</p>
                <button onClick={() => router.push("/professor-config")} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Configurar agora <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
