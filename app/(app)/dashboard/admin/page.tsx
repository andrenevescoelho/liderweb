"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const canAccessAdminDashboard = userRole === "ADMIN" || userPermissions.includes("report.group.access");

  useEffect(() => {
    if (!canAccessAdminDashboard) {
      router.replace("/dashboard");
      return;
    }

    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [canAccessAdminDashboard, router]);

  const adminInsights = data?.adminInsights;
  const monthlySchedules = adminInsights?.reports?.schedulesByMonth ?? [];

  const smartIndicators = useMemo(
    () => [
      {
        label: "Sobrecarga",
        value: adminInsights?.smartIndicators?.overloadedMinistry,
        helper: "Concentração alta das escalas em poucos membros.",
      },
      {
        label: "Repetição",
        value: adminInsights?.smartIndicators?.repeatedMembers,
        helper: "Os mesmos membros aparecem com frequência elevada.",
      },
      {
        label: "Diversidade",
        value: adminInsights?.smartIndicators?.lowDiversity,
        helper: "Baixa cobertura em instrumentos críticos.",
      },
      {
        label: "Ausência",
        value: adminInsights?.smartIndicators?.highAbsenceMember,
        helper: "Percentual de recusas acima do ideal.",
      },
    ],
    [adminInsights]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!canAccessAdminDashboard) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/80 bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard de Administração</h1>
            <p className="text-sm text-muted-foreground">Gestão e métricas do ministério</p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">Voltar para início</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl border border-border/80">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Frequência de confirmações</p>
            <p className="mt-2 text-3xl font-semibold">{(adminInsights?.confirmationRate ?? 0).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-border/80">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Gestão de membros</p>
            <p className="mt-2 text-3xl font-semibold">{adminInsights?.members?.active ?? 0}</p>
            <p className="text-xs text-muted-foreground">ativos • {adminInsights?.members?.inactive ?? 0} inativos</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-border/80">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Evolução de escalas</p>
            <p className="mt-2 text-3xl font-semibold">{adminInsights?.reports?.schedulesInMonth ?? 0}</p>
            <p className="text-xs text-muted-foreground">escalas no mês</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border border-border/80">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Repertório (tom mais usado)</p>
            <p className="mt-2 text-3xl font-semibold">{adminInsights?.repertoire?.topKey ?? "N/A"}</p>
            <p className="text-xs text-muted-foreground">BPM médio: {adminInsights?.repertoire?.averageBpm ?? "N/A"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-xl border border-border/80">
          <CardHeader>
            <CardTitle>Evolução de escalas</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySchedules}>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                <Tooltip cursor={{ stroke: "rgba(148,163,184,0.2)", strokeWidth: 1 }} />
                <Line dataKey="count" type="monotone" stroke="#8B5CF6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/80">
          <CardHeader>
            <CardTitle>Frequência de confirmações (últimos 6)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySchedules.slice(-6)}>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.18)" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                <Bar dataKey="count" fill="#7C3AED" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-xl border border-border/80">
          <CardHeader>
            <CardTitle>Repertório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Músicas sem uso</p>
                <p className="text-xl font-semibold">{adminInsights?.repertoire?.unusedSongsCount ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Músicas novas</p>
                <p className="text-xl font-semibold">{adminInsights?.repertoire?.newSongsInMonth ?? 0}</p>
              </div>
            </div>
            <div className="space-y-2">
              {(adminInsights?.repertoire?.mostUsedSongs ?? []).slice(0, 5).map((song: any, index: number) => (
                <div key={`${song.title}-${index}`} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  <span>{index + 1}. {song.title}</span>
                  <span className="text-muted-foreground">{song.uses}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-500" />
              Indicadores inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {smartIndicators.map((indicator) => (
              <div key={indicator.label} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{indicator.label}</p>
                  <Badge variant={indicator.value ? "warning" : "success"}>{indicator.value ? "Atenção" : "OK"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{indicator.helper}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
