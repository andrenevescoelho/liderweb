"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ServerCrash,
  Plus,
  Bell,
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
import { toast } from "@/hooks/use-toast";
import { can, canAny } from "@/lib/rbac";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [confirmingNextCommitment, setConfirmingNextCommitment] = useState(false);

  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const userName = session?.user?.name ?? "";
  const canAccessReports =
    userRole === "ADMIN" ||
    userRole === "LEADER" ||
    userPermissions.includes("report.group.access") ||
    userPermissions.includes("report.minister.stats");
  const canAccessAdminDashboard =
    userRole === "ADMIN" || userPermissions.includes("report.group.access");
  const sessionUser = {
    role: userRole,
    permissions: userPermissions,
  };

  const fetchData = () => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };


  useEffect(() => {
    fetchData();
  }, [canAccessReports]);

  const handleRespond = async (scheduleId: string, roleId: string, status: "ACCEPTED" | "DECLINED") => {
    setResponding(roleId);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, status }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          toast({
            title: "Sessão expirada",
            description: "Faça login novamente para continuar.",
            variant: "destructive",
          });
          router.push("/login");
          return;
        }

        if (res.status === 403) {
          toast({
            title: "Sem permissão",
            description: "Você não tem permissão para confirmar presença.",
            variant: "destructive",
          });
          return;
        }

        if (res.status === 404) {
          toast({
            title: "Compromisso não encontrado",
            description: "Atualizando os seus compromissos.",
            variant: "destructive",
          });
          fetchData();
          return;
        }

        toast({
          title: "Erro ao responder",
          description: "Não foi possível atualizar sua presença agora.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: status === "ACCEPTED" ? "Presença confirmada" : "Presença recusada",
      });
      fetchData();
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao responder",
        description: "Não foi possível atualizar sua presença agora.",
        variant: "destructive",
      });
    } finally {
      setResponding(null);
    }
  };

  const handleConfirmNextCommitment = async () => {
    const nextCommitment = myUpcomingSchedules?.[0];

    if (!nextCommitment?.id || !nextCommitment?.roleId || nextCommitment?.myStatus !== "PENDING") {
      return;
    }

    setConfirmingNextCommitment(true);

    try {
      const res = await fetch(`/api/schedules/${nextCommitment.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: nextCommitment.roleId, status: "ACCEPTED" }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          toast({
            title: "Sessão expirada",
            description: "Faça login novamente para continuar.",
            variant: "destructive",
          });
          router.push("/login");
          return;
        }

        if (res.status === 403) {
          toast({
            title: "Sem permissão",
            description: "Você não tem permissão para confirmar presença.",
            variant: "destructive",
          });
          return;
        }

        if (res.status === 404) {
          toast({
            title: "Compromisso não encontrado",
            description: "Atualizando os seus compromissos.",
            variant: "destructive",
          });
          fetchData();
          return;
        }

        toast({
          title: "Erro ao confirmar",
          description: "Não foi possível confirmar sua presença agora.",
          variant: "destructive",
        });
        return;
      }

      setData((prev: any) => {
        const previousSchedules = prev?.myUpcomingSchedules ?? [];
        const updatedSchedules = previousSchedules.map((schedule: any) =>
          schedule?.id === nextCommitment.id && schedule?.roleId === nextCommitment.roleId
            ? { ...schedule, myStatus: "ACCEPTED" }
            : schedule
        );

        return {
          ...prev,
          myUpcomingSchedules: updatedSchedules,
        };
      });

      toast({
        title: "Presença confirmada",
        description: "Seu próximo compromisso foi confirmado com sucesso.",
      });
      fetchData();
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro ao confirmar",
        description: "Não foi possível confirmar sua presença agora.",
        variant: "destructive",
      });
    } finally {
      setConfirmingNextCommitment(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getScheduleSongsPreview = (schedule: any) => {
    const songs = (schedule?.setlist?.items ?? [])
      .map((item: any) => item?.song?.title)
      .filter(Boolean) as string[];

    if (songs.length === 0) {
      return {
        preview: "Sem músicas definidas",
        fullPreview: "Sem músicas definidas",
        countLabel: "0 músicas",
      };
    }

    const previewSongs = songs.slice(0, 3);
    const remaining = songs.length - previewSongs.length;
    const preview = `${previewSongs.join(" • ")}${remaining > 0 ? ` • +${remaining}` : ""}`;

    return {
      preview,
      fullPreview: songs.join(" • "),
      countLabel: `${songs.length} música${songs.length > 1 ? "s" : ""}`,
    };
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
  const nextCommitment = myUpcomingSchedules?.[0] ?? null;
  const canConfirmPresence = can(sessionUser, "schedule.presence.confirm.self");
  const canViewMembersCard = canAny(sessionUser, ["member.view", "member.manage"]);
  const canManageSchedules = canAny(sessionUser, ["schedule.create", "schedule.edit"]);
  const canViewSongsCard = canAny(sessionUser, ["music.view", "music.manage", "setlist.music.add", "music.rehearsal.send", "music.submitted.edit"]);
  const canSendReminder = canAny(sessionUser, ["communication.schedule.announce", "schedule.edit", "report.group.access"]);
  const quickActions = [
    canManageSchedules
      ? {
          key: "schedule",
          href: "/schedules",
          label: "Criar escala",
          icon: Plus,
        }
      : null,
    canViewSongsCard
      ? {
          key: "song",
          href: "/songs",
          label: "Adicionar música",
          icon: Music,
        }
      : null,
    canSendReminder
      ? {
          key: "reminder",
          href: canAccessAdminDashboard ? "/dashboard/admin" : "/schedules",
          label: "Enviar lembrete",
          icon: Bell,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; href: string; label: string; icon: any }>;

  const showQuickActions = quickActions.length > 0;
  const shouldShowNextCommitmentCard =
    userRole === "MEMBER" &&
    !!nextCommitment?.id &&
    !!nextCommitment?.roleId &&
    canConfirmPresence;
  const isNextCommitmentPending = nextCommitment?.myStatus === "PENDING";

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


      {shouldShowNextCommitmentCard && (
        <Card>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div>
              <p className="text-sm text-gray-500">Próximo compromisso</p>
              <p className="font-semibold">{nextCommitment?.setlist?.name ?? "Compromisso sem repertório"}</p>
              {nextCommitment?.date && (
                <p className="text-sm text-gray-500 mt-1">
                  {format(new Date(nextCommitment.date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                </p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {isNextCommitmentPending ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleConfirmNextCommitment}
                  disabled={confirmingNextCommitment}
                >
                  {confirmingNextCommitment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Confirmar presença"
                  )}
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Confirmado
                </Button>
              )}
              <Link href="/songs"><Button size="sm" variant="outline">Baixar material</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      {userRole !== "SUPERADMIN" && (
        <>
          {showQuickActions && (
            <Card className="rounded-xl border border-border/80">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Ações rápidas</p>
                    <p className="text-base font-semibold">Acelere a rotina do ministério</p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-3 md:w-auto">
                    {quickActions.map((action) => (
                      <Link key={action.key} href={action.href}>
                        <Button size="sm" variant="outline" className="w-full justify-start gap-2">
                          <action.icon className="h-4 w-4" /> {action.label}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {canAccessAdminDashboard && (
            <Card className="rounded-xl border border-border/80">
              <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Gestão e métricas</p>
                  <p className="font-medium">Acesse análises no Dashboard de Administração</p>
                </div>
                <Link href="/dashboard/admin">
                  <Button size="sm" variant="primary">Ir para Administração</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Minhas Próximas Escalas */}
          <Card className="rounded-xl border border-border/80">
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
                      
                      <div className="mb-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{schedule?.myRole}</Badge>
                          <span className="text-sm text-gray-500">{getScheduleSongsPreview(schedule).countLabel}</span>
                        </div>
                        <p
                          className="text-sm text-gray-600 dark:text-gray-300 truncate"
                          title={getScheduleSongsPreview(schedule).fullPreview}
                        >
                          {getScheduleSongsPreview(schedule).preview}
                        </p>
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
            <Card className="rounded-xl border border-border/80">
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
                    <div key={song?.id ?? ''} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
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
                      <div className="flex items-center gap-2">
                        <Link href={`/songs?songId=${song?.id ?? ""}`}>
                          <Button size="sm" variant="ghost">Ver música</Button>
                        </Link>
                        {song?.canMarkRehearsed && (
                          <Button size="sm" variant="outline">Marcar como ensaiada</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Escalas do Grupo (apenas para Admin/Leader) */}
          {canAccessReports && (upcomingSchedules?.length ?? 0) > 0 && (
            <Card className="rounded-xl border border-border/80">
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
                          <p
                            className="text-xs text-gray-500 dark:text-gray-400 truncate"
                            title={getScheduleSongsPreview(schedule).fullPreview}
                          >
                            {getScheduleSongsPreview(schedule).preview} · {getScheduleSongsPreview(schedule).countLabel}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {canViewMembersCard && (
              <Card className="rounded-xl border border-border/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    Membros
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold">{stats?.totalMembers ?? 0}</p>
                  <Link href="/members">
                    <Button size="sm" variant="outline">Gerenciar membros</Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {canViewSongsCard && (
              <Card className="rounded-xl border border-border/80">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="w-5 h-5 text-blue-600" />
                    Músicas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-bold">{stats?.totalSongs ?? 0}</p>
                  <Link href="/songs">
                    <Button size="sm" variant="outline">Gerenciar repertório</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Pendências (mantidas só para membros sem gestão) */}
          {!canAccessAdminDashboard && (pendingConfirmations?.length ?? 0) > 0 && (
            <Card className="rounded-xl border border-border/80">
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
