"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Music,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Headphones,
  Youtube,
  Play,
  CreditCard,
  ExternalLink,
  ServerCrash,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  Line,
} from "recharts";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const userName = session?.user?.name ?? "";
  const canAccessReports =
    userRole === "ADMIN" ||
    userRole === "LEADER" ||
    userPermissions.includes("report.group.access") ||
    userPermissions.includes("report.minister.stats");

  const fetchData = () => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchSubscription = () => {
    fetch("/api/subscription/status")
      .then((res) => res.json())
      .then((d) => setSubscription(d))
      .catch(() => {});
  };

  useEffect(() => {
    fetchData();
    if (canAccessReports) {
      fetchSubscription();
    }
  }, [canAccessReports]);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      router.push("/meu-plano");
    } finally {
      // mantém o loading por alguns ms só para feedback
      setTimeout(() => setPortalLoading(false), 300);
    }
  };

  const handleRespond = async (scheduleId: string, roleId: string, status: "ACCEPTED" | "DECLINED") => {
    setResponding(roleId);
    try {
      await fetch(`/api/schedules/${scheduleId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, status }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setResponding(null);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const stats = data?.stats ?? {};
  const upcomingSchedules = data?.upcomingSchedules ?? [];
  const myUpcomingSchedules = data?.myUpcomingSchedules ?? [];
  const pendingConfirmations = data?.pendingConfirmations ?? [];
  const songsToRehearse = data?.songsToRehearse ?? [];
  const adminInsights = data?.adminInsights;
  const monthlySchedules = adminInsights?.reports?.schedulesByMonth ?? [];



  return (
    <div className="space-y-6">
      {userRole !== "SUPERADMIN" && (
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Olá, {userName?.split?.(' ')?.[0] ?? 'Usuário'}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Bem-vindo ao Líder Web
            </p>
            {data?.groupName && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ministério: {data.groupName}
              </p>
            )}
          </div>
        </div>
      )}

      {userRole === "SUPERADMIN" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Estratégico</h1>
            <p className="text-gray-600 dark:text-gray-400">Visão macro da saúde e crescimento da plataforma</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/alertas-inteligentes">
              <Button variant="outline">Ir para Alertas inteligentes</Button>
            </Link>
            <Link href="/dashboard/saude-sistema">
              <Button variant="outline">Ir para Saúde do sistema</Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Button
              variant="ghost"
              className="h-auto p-0 rounded-lg hover:opacity-95"
              onClick={() => scrollToSection("financeiro-consolidado")}
            >
              <Card className="w-full text-left bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
                <CardContent className="p-6">
                  <p className="text-emerald-100">MRR</p>
                  <p className="text-3xl font-bold">R$ {(stats?.mrr ?? 0).toLocaleString("pt-BR")}</p>
                  <p className="mt-2 text-xs text-emerald-100/90">Ver consolidado</p>
                </CardContent>
              </Card>
            </Button>
            <Button variant="ghost" className="h-auto p-0 rounded-lg hover:opacity-95" onClick={() => scrollToSection("uso-consolidado")}>
              <Card className="w-full text-left bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
                <CardContent className="p-6">
                  <p className="text-indigo-100">Igrejas ativas</p>
                  <p className="text-3xl font-bold">{stats?.activeChurches ?? 0}</p>
                  <p className="mt-2 text-xs text-indigo-100/90">Ver uso consolidado</p>
                </CardContent>
              </Card>
            </Button>
            <Button variant="ghost" className="h-auto p-0 rounded-lg hover:opacity-95" onClick={() => scrollToSection("crescimento-mensal")}>
              <Card className="w-full text-left bg-gradient-to-br from-amber-500 to-amber-700 text-white">
                <CardContent className="p-6">
                  <p className="text-amber-100">Igrejas em trial</p>
                  <p className="text-3xl font-bold">{stats?.trialChurches ?? 0}</p>
                  <p className="mt-2 text-xs text-amber-100/90">Ver crescimento</p>
                </CardContent>
              </Card>
            </Button>
            <Button variant="ghost" className="h-auto p-0 rounded-lg hover:opacity-95" onClick={() => scrollToSection("saude-sistema")}>
              <Card className="w-full text-left bg-gradient-to-br from-rose-500 to-rose-700 text-white">
                <CardContent className="p-6">
                  <p className="text-rose-100">Churn mensal</p>
                  <p className="text-3xl font-bold">{(stats?.churn ?? 0).toFixed(1)}%</p>
                  <p className="mt-2 text-xs text-rose-100/90">Ver saúde do sistema</p>
                </CardContent>
              </Card>
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2" id="crescimento-mensal">
              <CardHeader>
                <CardTitle>Crescimento mensal</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.superadminInsights?.monthlyGrowth ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="setlistsCreated"
                      fill="#60a5fa"
                      stroke="#2563eb"
                      fillOpacity={0.2}
                      name="Escalas criadas"
                    />
                    <Bar dataKey="newGroups" fill="#7c3aed" name="Novas igrejas" radius={[6, 6, 0, 0]} barSize={26} />
                    <Line type="monotone" dataKey="newGroups" stroke="#5b21b6" dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card id="financeiro-consolidado">
              <CardHeader>
                <CardTitle>Plano mais vendido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.topPlan ?? "Sem dados"}</p>
                <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <p>Total de ministérios: <span className="font-semibold">{stats?.totalMinistries ?? 0}</span></p>
                  <p>Ativos 30d: <span className="font-semibold">{stats?.activeMinistries30d ?? 0}</span></p>
                  <p>Inativos: <span className="font-semibold">{stats?.inactiveMinistries ?? 0}</span></p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card id="uso-consolidado">
              <CardHeader>
                <CardTitle>Uso por igreja (últimos 30 dias)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.superadminInsights?.schedulesByGroup ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="usage" fill="#0ea5e9" name="Escalas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card id="alertas-inteligentes">
              <CardHeader>
                <CardTitle>Alertas inteligentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Link href="/dashboard/alertas-inteligentes#igrejas-baixa-atividade" className="block p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 hover:opacity-90 transition-opacity">
                  Igrejas com baixa atividade: <span className="font-semibold">{data?.superadminInsights?.alerts?.lowActivityGroups?.length ?? 0}</span>
                </Link>
                <Link href="/dashboard/alertas-inteligentes#risco-pagamento" className="block p-3 rounded-md bg-rose-50 dark:bg-rose-900/20 hover:opacity-90 transition-opacity">
                  Risco de cancelamento/falha de pagamento: <span className="font-semibold">{data?.superadminInsights?.alerts?.paymentIssues ?? 0}</span>
                </Link>
                <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20">
                  Queda de engajamento: <span className="font-semibold">{data?.superadminInsights?.alerts?.engagementDrop ?? 0}%</span>
                </div>
                <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-900/20">
                  Sugestão IA de plano: <span className="font-semibold">{data?.superadminInsights?.aiSuggestions?.suggestedPlan ?? "N/A"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card id="saude-sistema">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerCrash className="h-5 w-5 text-rose-500" />
                Saúde do sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Link href="/dashboard/saude-sistema#erros-criticos" className="rounded-md bg-rose-50 dark:bg-rose-900/20 p-4 hover:opacity-90 transition-opacity">
                <p className="text-sm text-gray-600 dark:text-gray-300">Erros críticos</p>
                <p className="text-2xl font-bold text-rose-600">{data?.superadminInsights?.alerts?.systemErrors ?? 0}</p>
              </Link>
              <Link href="/dashboard/saude-sistema#falhas-pagamento" className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-4 hover:opacity-90 transition-opacity">
                <p className="text-sm text-gray-600 dark:text-gray-300">Falhas de pagamento</p>
                <p className="text-2xl font-bold text-yellow-600">{data?.superadminInsights?.alerts?.paymentIssues ?? 0}</p>
              </Link>
              <Link href="/dashboard/saude-sistema#risco-cancelamento" className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4 hover:opacity-90 transition-opacity">
                <p className="text-sm text-gray-600 dark:text-gray-300">Risco de cancelamento</p>
                <p className="text-2xl font-bold text-blue-600">{data?.superadminInsights?.alerts?.riskSubscriptions?.length ?? 0}</p>
              </Link>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Total de músicas</p><p className="text-2xl font-bold">{stats?.totalSongs ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Escalas no mês</p><p className="text-2xl font-bold">{stats?.setlistsInMonth ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Membros ativos (30d)</p><p className="text-2xl font-bold">{stats?.activeMembersIn30d ?? 0}</p></CardContent></Card>
          </div>
        </div>
      )}


      {(userRole === "ADMIN" || userRole === "LEADER") && adminInsights && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#121A2C] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
                <p className="text-sm text-slate-300">Visão operacional do ministério</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <select className="h-10 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-sm text-slate-100 outline-none focus:border-violet-400">
                  <option>{data?.groupName ? `Ministério: ${data.groupName}` : "Ministério atual"}</option>
                </select>
                <select className="h-10 rounded-xl border border-white/10 bg-slate-900/70 px-4 text-sm text-slate-100 outline-none focus:border-violet-400">
                  <option>Últimos 30 dias</option>
                  <option>Últimos 60 dias</option>
                  <option>Últimos 90 dias</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="h-full rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <p className="text-sm text-slate-300">Taxa de confirmação</p>
              <p className="mt-3 text-3xl font-semibold text-white">{(adminInsights?.confirmationRate ?? 0).toFixed(1)}%</p>
              <p className="mt-2 text-xs text-slate-400">Aceites no período</p>
            </Card>
            <Card className="h-full rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <p className="text-sm text-slate-300">Pendentes</p>
              <p className="mt-3 text-3xl font-semibold text-white">{adminInsights?.pendingTasks ?? 0}</p>
              <p className="mt-2 text-xs text-slate-400">Confirmações aguardando resposta</p>
            </Card>
            <Card className="h-full rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <p className="text-sm text-slate-300">Próximo culto</p>
              <p className="mt-3 text-lg font-semibold text-white">{adminInsights?.nextSchedule?.setlist?.name ?? "Sem culto"}</p>
              <p className="mt-2 text-xs text-slate-400">{adminInsights?.nextSchedule?.date ? format(new Date(adminInsights.nextSchedule.date), "dd MMM, HH:mm", { locale: ptBR }) : "Sem data definida"}</p>
            </Card>
            <Card className="h-full rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <p className="text-sm text-slate-300">Músicas para ensaio</p>
              <p className="mt-3 text-3xl font-semibold text-white">{songsToRehearse?.length ?? 0}</p>
              <p className="mt-2 text-xs text-slate-400">Repertório preparado para a semana</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Próxima escala</h2>
                  <p className="text-sm text-slate-400">Membros escalados e status de resposta</p>
                </div>
              </div>
              <div className="space-y-3">
                {(adminInsights?.nextSchedule?.roles ?? []).slice(0, 6).map((role: any) => (
                  <div key={role.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium text-slate-100">{role.member?.name ?? role.memberName ?? "Membro"}</p>
                      <p className="text-xs text-slate-400">{role.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={role.status === "ACCEPTED" ? "success" : role.status === "DECLINED" ? "danger" : "secondary"}>
                        {role.status === "ACCEPTED" ? "Confirmado" : role.status === "DECLINED" ? "Recusado" : "Pendente"}
                      </Badge>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">Ver</Button>
                        <Button size="sm" variant="outline">Editar</Button>
                        <Button size="sm" variant="outline">Lembrete</Button>
                      </div>
                    </div>
                  </div>
                ))}
                {(adminInsights?.nextSchedule?.roles ?? []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-400">Nenhuma escala futura com membros encontrados.</div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <h2 className="text-lg font-semibold text-white">Confirmações últimos 6 cultos</h2>
              <p className="mb-4 text-sm text-slate-400">Histórico recente de confirmações</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(monthlySchedules ?? []).slice(-6)}>
                    <CartesianGrid strokeDasharray="2 6" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.1)" }} contentStyle={{ backgroundColor: "#0F172A", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }} />
                    <Bar dataKey="count" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <h2 className="text-lg font-semibold text-white">Repertório</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Músicas novas (mês)</p>
                  <p className="text-xl font-semibold text-white">{adminInsights?.repertoire?.newSongsInMonth ?? 0}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                  <p className="text-slate-400">Tom mais usado</p>
                  <p className="text-xl font-semibold text-white">{adminInsights?.repertoire?.topKey ?? "N/A"}</p>
                </div>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-slate-200">Top 5 músicas</p>
                <div className="space-y-2">
                  {(adminInsights?.repertoire?.mostUsedSongs ?? []).slice(0, 5).map((song: any, index: number) => (
                    <div key={`${song.title}-${index}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-sm">
                      <span className="text-slate-200">{index + 1}. {song.title}</span>
                      <span className="text-slate-400">{song.uses}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#121A2C] p-6">
              <h2 className="text-lg font-semibold text-white">Indicadores inteligentes</h2>
              <p className="mt-1 text-sm text-slate-400">Alertas operacionais para ação rápida</p>
              <div className="mt-4 space-y-3 text-sm">
                {[
                  {
                    label: "Ministério sobrecarregado",
                    value: adminInsights?.smartIndicators?.overloadedMinistry,
                    reason: "Concentração alta das escalas em poucos membros.",
                  },
                  {
                    label: "Membros repetidos",
                    value: adminInsights?.smartIndicators?.repeatedMembers,
                    reason: "Os mesmos membros aparecem com frequência elevada.",
                  },
                  {
                    label: "Diversidade de instrumentos",
                    value: adminInsights?.smartIndicators?.lowDiversity,
                    reason: "Baixa cobertura em instrumentos críticos.",
                  },
                  {
                    label: "Índice de ausência",
                    value: adminInsights?.smartIndicators?.highAbsenceMember,
                    reason: "Percentual de recusas acima do ideal.",
                  },
                ].map((indicator) => (
                  <div key={indicator.label} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{indicator.label}</span>
                      <Badge variant={indicator.value ? "secondary" : "success"}>{indicator.value ? "Atenção" : "OK"}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">{indicator.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {userRole === "MEMBER" && (
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div>
              <p className="text-sm text-gray-500">Próximo compromisso</p>
              <p className="font-semibold">{myUpcomingSchedules?.[0]?.setlist?.name ?? "Nenhum compromisso pendente"}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/schedules"><Button size="sm" variant="primary">Confirmar presença</Button></Link>
              <Link href="/songs"><Button size="sm" variant="outline">Baixar material</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      {canAccessReports && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Membros</p>
                  <p className="text-3xl font-bold">{stats?.totalMembers ?? 0}</p>
                </div>
                <Users className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Músicas</p>
                  <p className="text-3xl font-bold">{stats?.totalSongs ?? 0}</p>
                </div>
                <Music className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Seção de Assinatura para Admin/Leader */}
      {canAccessReports && subscription && (
        <Card className={`border ${subscription.isActive ? "border-green-500/40" : subscription.hasSubscription ? "border-yellow-500/40" : "border-gray-300/40"}`}>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="w-4 h-4" />
                Assinatura
                {subscription.subscription?.status && (
                  <Badge
                    variant={
                      subscription.subscription?.status === "ACTIVE" ? "success" :
                      subscription.subscription?.status === "TRIALING" ? "info" :
                      subscription.subscription?.status === "CANCELED" ? "danger" : "secondary"
                    }
                    className="ml-2"
                  >
                    {subscription.subscription?.status === "ACTIVE" ? "Ativa" :
                     subscription.subscription?.status === "TRIALING" ? "Teste" :
                     subscription.subscription?.status === "CANCELED" ? "Cancelada" :
                     subscription.subscription?.status}
                  </Badge>
                )}
              </CardTitle>

              {userRole === "ADMIN" && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Abrindo...
                    </>
                  ) : (
                    <>
                      Gerenciar
                      <ExternalLink className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
              <span>
                Plano:{" "}
                <span className="font-semibold text-gray-900 dark:text-white">
                  {subscription.subscription?.planName ?? "Sem plano"}
                </span>
              </span>

              {subscription.hasSubscription && (
                <>
                  <span>
                    Usuários:{" "}
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {subscription.subscription?.userCount ?? 0}/{subscription.subscription?.userLimit === 0 ? "∞" : subscription.subscription?.userLimit}
                    </span>
                  </span>

                  {subscription.subscription?.currentPeriodEnd && (
                    <span>
                      Próxima cobrança:{" "}
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {format(new Date(subscription.subscription.currentPeriodEnd), "dd/MM/yyyy")}
                      </span>
                    </span>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {userRole !== "SUPERADMIN" && (
        <>
          {/* Minhas Próximas Escalas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                Minhas Próximas Escalas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(myUpcomingSchedules?.length ?? 0) === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  Você não está escalado para nenhum evento próximo
                </p>
              ) : (
                <div className="space-y-3">
                  {myUpcomingSchedules?.slice?.(0, 5)?.map?.((schedule: any) => (
                    <div
                      key={schedule?.id ?? ''}
                      className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex flex-col items-center justify-center">
                            <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                              {schedule?.date
                                ? format(new Date(schedule?.date), "MMM", { locale: ptBR }).toUpperCase()
                                : ""}
                            </span>
                            <span className="text-lg font-bold text-purple-700 dark:text-purple-300">
                              {schedule?.date
                                ? format(new Date(schedule?.date), "dd")
                                : ""}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {schedule?.setlist?.name ?? "Sem repertório"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {schedule?.date
                                ? format(new Date(schedule?.date), "EEEE, dd 'de' MMMM", { locale: ptBR })
                                : ""}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            schedule?.myStatus === "ACCEPTED"
                              ? "success"
                              : schedule?.myStatus === "DECLINED"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {schedule?.myStatus === "ACCEPTED"
                            ? "Confirmado"
                            : schedule?.myStatus === "DECLINED"
                            ? "Recusado"
                            : "Pendente"}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="info">{schedule?.myRole}</Badge>
                        <span className="text-sm text-gray-500">
                          {schedule?.setlist?.items?.length ?? 0} músicas no repertório
                        </span>
                      </div>

                      <div className="mb-3">
                        <Link href={`/schedules?scheduleId=${schedule?.id ?? ""}`}>
                          <Button size="sm" variant="ghost" className="px-0">
                            Ver escala
                          </Button>
                        </Link>
                      </div>

                      {schedule?.myStatus === "PENDING" && (
                        <div className="flex gap-2 pt-2 border-t dark:border-gray-700">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleRespond(schedule.id, schedule.roleId, "ACCEPTED")}
                            disabled={responding === schedule.roleId}
                            className="flex-1"
                          >
                            {responding === schedule.roleId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleRespond(schedule.id, schedule.roleId, "DECLINED")}
                            disabled={responding === schedule.roleId}
                            className="flex-1"
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Recusar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Músicas para Ensaiar */}
          {(songsToRehearse?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-green-600" />
                  Músicas para Ensaiar
                  <Badge variant="info" className="ml-2">{songsToRehearse.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {songsToRehearse?.map?.((song: any) => (
                    <Link
                      key={song?.id ?? ''}
                      href={`/songs?songId=${song?.id ?? ""}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                    >
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                        <Music className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {song?.title ?? ''}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {song?.artist && <span className="truncate">{song.artist}</span>}
                          <Badge variant="default">{song?.customKey ?? song?.originalKey ?? 'C'}</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {song?.youtubeUrl && (
                          <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <Youtube className="w-3 h-3 text-red-500" />
                          </div>
                        )}
                        {song?.audioUrl && (
                          <div className="w-6 h-6 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <Play className="w-3 h-3 text-green-500" />
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Escalas do Grupo (apenas para Admin/Leader) */}
          {canAccessReports && (upcomingSchedules?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  Todas as Escalas do Grupo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingSchedules?.slice?.(0, 4)?.map?.((schedule: any) => (
                    <Link
                      key={schedule?.id ?? ''}
                      href={`/schedules?scheduleId=${schedule?.id ?? ""}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {schedule?.setlist?.name ?? "Sem repertório"}
                          </p>
                          <p className="text-sm text-gray-500">
                            {schedule?.date
                              ? format(new Date(schedule?.date), "dd 'de' MMMM", { locale: ptBR })
                              : ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant="info">
                        {schedule?.roles?.length ?? 0} escalados
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pendências (Admin/Leader) */}
          {canAccessReports && (pendingConfirmations?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Confirmações Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingConfirmations?.slice?.(0, 5)?.map?.((item: any) => (
                    <div
                      key={item?.id ?? ''}
                      className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item?.member?.name ?? "Membro"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {item?.schedule?.date
                            ? format(new Date(item?.schedule?.date), "dd/MM/yyyy")
                            : ""}
                          {item?.role ? ` - ${item?.role}` : ""}
                        </p>
                      </div>
                      <Badge variant="warning">Pendente</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
