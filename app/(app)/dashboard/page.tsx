"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, differenceInDays } from "date-fns";
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
  Gift,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { can, canAny } from "@/lib/rbac";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { MinistryInsightsCard } from "@/components/ministry-insights-card";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [confirmingNextCommitment, setConfirmingNextCommitment] = useState(false);
  const [nextRehearsal, setNextRehearsal] = useState<any>(null);
  const [confirmingRehearsal, setConfirmingRehearsal] = useState(false);
  const [myEvaluation, setMyEvaluation] = useState<any>(null);
  const [checkinData, setCheckinData] = useState<any>(null);
  const [checkinLoading, setCheckinLoading] = useState(true);
  const [checkinMood, setCheckinMood] = useState<string | null>(null);
  const [checkinNote, setCheckinNote] = useState("");
  const [checkinPrivacy, setCheckinPrivacy] = useState("LEADER_ONLY");
  const [checkinPrayer, setCheckinPrayer] = useState(false);
  const [checkinCare, setCheckinCare] = useState(false);
  const [submittingCheckin, setSubmittingCheckin] = useState(false);
  const [checkinResponse, setCheckinResponse] = useState<any>(null);
  const [preScaleCheckin, setPreScaleCheckin] = useState<any>(null);
  const [submittingPreScale, setSubmittingPreScale] = useState(false);
  const [preScaleMood, setPreScaleMood] = useState<string | null>(null);

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

  const submitPreScaleCheckin = async (mood: string) => {
    if (!nextCommitment?.id) return;
    setPreScaleMood(mood);
    setSubmittingPreScale(true);
    try {
      const res = await fetch("/api/saude/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood,
          privacyLevel: "LEADER_ONLY",
          scheduleId: nextCommitment.id,
          requestedCare: mood === "MUITO_MAL",
        }),
      });
      const data = await res.json();
      if (data.success) setPreScaleCheckin({ mood, encouragement: data.encouragement });
    } catch {}
    finally { setSubmittingPreScale(false); }
  };

  const PRE_SCALE_OPTIONS = [
    { key: "MUITO_MAL",  emoji: "😞", label: "Não estou bem",   color: "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300" },
    { key: "DESANIMADO", emoji: "😕", label: "Com reservas",    color: "border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300" },
    { key: "NEUTRO",     emoji: "😐", label: "Mais ou menos",   color: "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300" },
    { key: "BEM",        emoji: "🙂", label: "Estou bem",       color: "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" },
    { key: "MOTIVADO",   emoji: "🔥", label: "Pronto!",         color: "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300" },
  ];

  const MOOD_OPTIONS = [
    { key: "MUITO_MAL", emoji: "😞", label: "Muito mal", color: "border-red-400 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300" },
    { key: "DESANIMADO", emoji: "😕", label: "Desanimado", color: "border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300" },
    { key: "NEUTRO", emoji: "😐", label: "Neutro", color: "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300" },
    { key: "BEM", emoji: "🙂", label: "Bem", color: "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" },
    { key: "MOTIVADO", emoji: "🔥", label: "Motivado", color: "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300" },
  ];

  const submitCheckin = async () => {
    if (!checkinMood) return;
    setSubmittingCheckin(true);
    try {
      const res = await fetch("/api/saude/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood: checkinMood,
          note: checkinNote || null,
          privacyLevel: checkinPrivacy,
          requestedPrayer: checkinPrayer,
          requestedCare: checkinCare,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCheckinResponse(data);
        setCheckinData((prev: any) => ({ ...prev, hasCheckedInToday: true }));
      }
    } catch {}
    finally { setSubmittingCheckin(false); }
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

  const fetchNextRehearsal = () => {
    fetch("/api/rehearsals/next")
      .then((res) => res.json())
      .then((d) => setNextRehearsal(d))
      .catch(() => setNextRehearsal(null));
  };


  useEffect(() => {
    fetchData();
    fetchNextRehearsal();
  }, [canAccessReports]);

  useEffect(() => {
    const userId = (session?.user as any)?.id;
    if (!userId) return;

    fetch(`/api/members/${userId}/evaluation`)
      .then(r => r.json())
      .then(d => setMyEvaluation(d))
      .catch(() => {});

    fetch("/api/saude/checkin")
      .then(r => r.json())
      .then(d => { setCheckinData(d); setCheckinLoading(false); })
      .catch(() => setCheckinLoading(false));
  }, [session]);

  const handleConfirmNextRehearsal = async () => {
    if (!nextRehearsal?.id || nextRehearsal?.attendanceStatus !== "PENDING") {
      return;
    }

    setConfirmingRehearsal(true);
    try {
      const res = await fetch(`/api/rehearsals/${nextRehearsal.id}/attendance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACCEPTED" }),
      });

      if (!res.ok) {
        toast({
          title: "Não foi possível confirmar presença",
          description: "Tente novamente em instantes.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Presença confirmada",
        description: "Você confirmou presença no próximo ensaio.",
      });

      setNextRehearsal((prev: any) => (prev ? { ...prev, attendanceStatus: "ACCEPTED" } : prev));
      fetchNextRehearsal();
      fetchData();
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao confirmar presença",
        description: "Não conseguimos confirmar sua presença agora.",
        variant: "destructive",
      });
    } finally {
      setConfirmingRehearsal(false);
    }
  };

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

  const stats = data?.stats ?? {};
  const upcomingSchedules = data?.upcomingSchedules ?? [];
  const myUpcomingSchedules = data?.myUpcomingSchedules ?? [];
  const pendingConfirmations = data?.pendingConfirmations ?? [];
  const songsToRehearse = data?.songsToRehearse ?? [];
  const birthdaysToday = data?.birthdaysToday ?? [];
  const birthdaysMonth = data?.birthdaysMonth ?? [];
  const schedulesAwaitingMyReview = data?.schedulesAwaitingMyReview ?? [];
  const schedulesAwaitingPublish  = data?.schedulesAwaitingPublish  ?? [];
  const nextCommitment = myUpcomingSchedules?.[0] ?? null;
  const canManageSchedules = canAny(sessionUser, ["schedule.create", "schedule.edit"]);
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
    canManageSchedules
      ? {
          key: "ai-schedule",
          href: "/schedules?ai=1",
          label: "Gerar escala com IA",
          icon: Sparkles,
        }
      : null,
    {
          key: "song",
          href: "/songs",
          label: "Adicionar música",
          icon: Music,
        },
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
  const shouldShowRehearsalReminder =
    userRole !== "SUPERADMIN" && !!nextRehearsal?.id && nextRehearsal?.attendanceStatus === "PENDING";

  // Contexto para saudação inteligente
  const nextSched = upcomingSchedules?.[0];
  const daysToNext = nextSched?.date
    ? differenceInDays(new Date(nextSched.date), new Date())
    : null;
  const pendingCount = pendingConfirmations?.length ?? 0;
  const firstName = userName?.split(' ')?.[0] ?? 'Líder';
  // Calcular média e nível baseado na avaliação
  const evalAvg = myEvaluation?.criteria
    ? Object.values(myEvaluation.criteria as Record<string, number>).reduce((a, b) => a + b, 0) /
      Object.values(myEvaluation.criteria as Record<string, number>).length
    : null;

  const getMemberLevel = (avg: number | null) => {
    if (avg === null) return null;
    if (avg >= 4.5) return { level: 5, label: "Especialista", color: "text-purple-600" };
    if (avg >= 4.0) return { level: 4, label: "Avançado", color: "text-blue-600" };
    if (avg >= 3.0) return { level: 3, label: "Intermediário", color: "text-green-600" };
    if (avg >= 2.0) return { level: 2, label: "Em desenvolvimento", color: "text-yellow-600" };
    return { level: 1, label: "Iniciante", color: "text-orange-600" };
  };
  const memberLevel = getMemberLevel(evalAvg);

  const greetingHeadline = (() => {
    if (daysToNext === 0) return `${firstName}, hoje tem culto! 🎶`;
    if (daysToNext === 1) return `${firstName}, amanhã tem culto!`;
    if (daysToNext !== null && daysToNext <= 3) return `${firstName}, culto em ${daysToNext} dias.`;
    return `Olá, ${firstName}!`;
  })();
  const greetingSubline = (() => {
    if (daysToNext !== null && daysToNext <= 3) return "Certifique-se que todos estão confirmados.";
    if (pendingCount > 0) return `${pendingCount} membro${pendingCount > 1 ? "s" : ""} ainda não confirmou${pendingCount > 1 ? "ram" : ""} presença.`;
    // Para membros com avaliação, mensagem personalizada
    if (evalAvg !== null && userRole === "MEMBER") {
      if (evalAvg < 3) return `Você tem pontos importantes para desenvolver. Confira seu plano abaixo.`;
      if (evalAvg < 4) return `Você está progredindo! Continue seu desenvolvimento no Professor IA.`;
      return `Você está indo muito bem! Continue assim.`;
    }
    return data?.groupName ? `Ministério ${data.groupName} — tudo sob controle.` : "Seu ministério organizado em um só lugar.";
  })();

  return (
    <div className="space-y-6">
      {userRole !== "SUPERADMIN" && (
        <div className="flex items-start gap-4 rounded-xl border border-border/60 bg-gradient-to-r from-purple-500/5 to-transparent p-5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
            <LayoutDashboard className="w-5 h-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{greetingHeadline}</h1>
              {memberLevel && userRole === "MEMBER" && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  memberLevel.level >= 4 ? "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700" :
                  memberLevel.level === 3 ? "border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700" :
                  "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700"
                }`}>
                  Nível {memberLevel.level} — {memberLevel.label}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{greetingSubline}</p>
            {nextSched && daysToNext !== null && daysToNext > 3 && (
              <p className="text-xs text-muted-foreground mt-1">
                Próximo culto: <span className="font-medium text-foreground">
                  {format(new Date(nextSched.date), "dd 'de' MMMM", { locale: ptBR })}
                  {nextSched.name ? ` — ${nextSched.name}` : ""}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {userRole === "ADMIN" && (
        <OnboardingChecklist
          totalMembers={stats?.totalMembers ?? 0}
          totalSongs={stats?.totalSongs ?? 0}
          totalSetlists={stats?.totalSetlists ?? 0}
          groupName={data?.groupName ?? null}
        />
      )}

      {/* Termômetro pré-escala — aparece quando culto em até 3 dias */}
      {userRole !== "SUPERADMIN" && daysToNext !== null && daysToNext <= 3 && nextCommitment && !preScaleCheckin && (
        <Card className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🎵</span>
              <p className="text-sm font-medium">
                {daysToNext === 0 ? "Hoje tem culto!" : daysToNext === 1 ? "Amanhã tem culto!" : `Culto em ${daysToNext} dias!`}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Você está emocionalmente preparado para ministrar?</p>
            <div className="flex gap-2">
              {PRE_SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  disabled={submittingPreScale}
                  onClick={() => submitPreScaleCheckin(opt.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all text-xs font-medium disabled:opacity-50 ${preScaleMood === opt.key ? opt.color : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"}`}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="hidden sm:block leading-tight text-center">{opt.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resposta pós termômetro */}
      {preScaleCheckin && (
        <Card className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
              {preScaleCheckin.mood === "MOTIVADO" || preScaleCheckin.mood === "BEM"
                ? "Que ótimo! O ministério conta com você! 🙌"
                : "Obrigado por ser honesto. O líder vai cuidar de você. 🙏"}
            </p>
            {preScaleCheckin.encouragement?.verse && (
              <>
                <p className="text-xs text-purple-600 dark:text-purple-400 italic">"{preScaleCheckin.encouragement.verse}"</p>
                <p className="text-xs text-muted-foreground mt-1">{preScaleCheckin.encouragement.reference}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Check-in emocional — Saúde do Ministério */}
      {userRole !== "SUPERADMIN" && !checkinLoading && !checkinData?.hasCheckedInToday && !checkinResponse && (
        <Card className="rounded-xl border border-border/80">
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-1">Como você está hoje?</p>
            <p className="text-xs text-muted-foreground mb-3">Sua resposta nos ajuda a cuidar melhor de você. É confidencial.</p>
            <div className="flex gap-2 mb-3">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setCheckinMood(checkinMood === m.key ? null : m.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border-2 transition-all text-xs font-medium ${checkinMood === m.key ? m.color : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"}`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="hidden sm:block">{m.label}</span>
                </button>
              ))}
            </div>
            {checkinMood && (
              <div className="space-y-2">
                <textarea
                  value={checkinNote}
                  onChange={e => setCheckinNote(e.target.value)}
                  placeholder="Quer compartilhar mais? (opcional)"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={checkinPrayer} onChange={e => setCheckinPrayer(e.target.checked)} className="rounded" />
                    Preciso de oração
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={checkinCare} onChange={e => setCheckinCare(e.target.checked)} className="rounded" />
                    Quero conversar
                  </label>
                </div>
                <Button size="sm" className="w-full" onClick={submitCheckin} disabled={submittingCheckin}>
                  {submittingCheckin ? "Registrando..." : "Registrar check-in"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Resposta pós check-in com encorajamento */}
      {checkinResponse?.encouragement && (
        <Card className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
          <CardContent className="py-4 text-center">
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">{checkinResponse.encouragement.message}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 italic">"{checkinResponse.encouragement.verse}"</p>
            <p className="text-xs text-muted-foreground mt-1">{checkinResponse.encouragement.reference}</p>
          </CardContent>
        </Card>
      )}

      {userRole !== "SUPERADMIN" && (birthdaysToday.length > 0 || birthdaysMonth.length > 0) && (
        <Card className="rounded-xl border border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-pink-600" />
              Aniversariantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Hoje</p>
              {birthdaysToday.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum aniversariante hoje.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {birthdaysToday.map((member: any) => (
                    <Badge key={member.id} variant="success">{member.name}</Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Neste mês</p>
              <div className="mt-1 space-y-1">
                {birthdaysMonth.slice(0, 6).map((member: any) => (
                  <p key={member.id} className="text-sm text-gray-600 dark:text-gray-300">
                    {member.name} • {member.birthDate ? format(new Date(member.birthDate), "dd/MM") : "--/--"}
                  </p>
                ))}
                {birthdaysMonth.length === 0 && (
                  <p className="text-sm text-gray-500">Nenhum aniversariante neste mês.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Card de revisão de músicas — aparece para o ministro quando há escalas aguardando */}

      {/* Card de escalas aprovadas aguardando publicação — só para ADMIN/LEADER */}
      {schedulesAwaitingPublish.length > 0 && (
        <Card className="border-blue-300 bg-blue-50/80 dark:bg-blue-900/20 dark:border-blue-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              {schedulesAwaitingPublish.length === 1
                ? "Uma escala foi aprovada pelo ministro — aguardando sua publicação"
                : `${schedulesAwaitingPublish.length} escalas foram aprovadas pelo ministro — aguardando publicação`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedulesAwaitingPublish.map((s: any) => {
              const schedDate = new Date(s.date);
              const approvedAt = s.ministerApprovedAt ? new Date(s.ministerApprovedAt) : null;
              const songs = s.setlist?.items ?? [];
              const isPublishing = publishingId === s.id;

              return (
                <div key={s.id} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-900/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {format(schedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </p>
                      {s.name && <p className="text-sm text-muted-foreground">{s.name}</p>}
                      {s.group?.name && <p className="text-xs text-muted-foreground">{s.group.name}</p>}
                    </div>
                    {approvedAt && (
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-1 rounded-full font-medium">
                        ✅ Aprovada {format(approvedAt, "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>

                  {songs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">🎵 Repertório aprovado:</p>
                      <ul className="space-y-1">
                        {songs.slice(0, 4).map((item: any, i: number) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-xs font-semibold text-blue-700 dark:text-blue-200 flex-shrink-0">{i + 1}</span>
                            <span className="truncate">{item.song?.title ?? "—"}</span>
                            {item.song?.artist && <span className="text-xs text-muted-foreground truncate">— {item.song.artist}</span>}
                          </li>
                        ))}
                        {songs.length > 4 && (
                          <li className="text-xs text-muted-foreground pl-7">+{songs.length - 4} música{songs.length - 4 !== 1 ? "s" : ""}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <button
                    disabled={isPublishing}
                    onClick={async () => {
                      setPublishingId(s.id);
                      try {
                        const res = await fetch("/api/schedules/status", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ scheduleId: s.id, action: "publish" }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                          fetchData();
                        } else {
                          alert(data.error ?? "Erro ao publicar");
                          setPublishingId(null);
                        }
                      } catch {
                        alert("Erro ao publicar. Tente novamente.");
                        setPublishingId(null);
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
                  >
                    {isPublishing
                      ? <><span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Publicando...</>
                      : "📢 Publicar escala agora"}
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {schedulesAwaitingMyReview.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/80 dark:bg-yellow-900/20 dark:border-yellow-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
              </span>
              {schedulesAwaitingMyReview.length === 1
                ? "Você precisa revisar as músicas de uma escala"
                : `Você precisa revisar as músicas de ${schedulesAwaitingMyReview.length} escalas`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schedulesAwaitingMyReview.map((s: any) => {
              const schedDate = new Date(s.date);
              const deadlineDate = s.reviewTimeoutAt ? new Date(s.reviewTimeoutAt) : null;
              const daysLeft = deadlineDate
                ? Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
              const songs = s.setlist?.items ?? [];

              return (
                <div key={s.id} className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-white dark:bg-yellow-900/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {format(schedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </p>
                      {s.name && <p className="text-sm text-muted-foreground">{s.name}</p>}
                      {s.group?.name && <p className="text-xs text-muted-foreground">{s.group.name}</p>}
                    </div>
                    {daysLeft !== null && (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        daysLeft <= 1
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          : daysLeft <= 3
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                      }`}>
                        {daysLeft <= 0 ? "Prazo vencendo hoje!" : `Prazo: ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>

                  {songs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">🎵 Músicas selecionadas:</p>
                      <ul className="space-y-1">
                        {songs.slice(0, 4).map((item: any, i: number) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded bg-yellow-200 dark:bg-yellow-800 flex items-center justify-center text-xs font-semibold text-yellow-800 dark:text-yellow-200 flex-shrink-0">{i + 1}</span>
                            <span className="truncate">{item.song?.title ?? "—"}</span>
                            {item.song?.artist && <span className="text-xs text-muted-foreground truncate">— {item.song.artist}</span>}
                          </li>
                        ))}
                        {songs.length > 4 && (
                          <li className="text-xs text-muted-foreground pl-7">+{songs.length - 4} música{songs.length - 4 !== 1 ? "s" : ""}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <a
                    href={`/schedules/review?id=${s.id}`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-semibold text-sm transition-colors"
                  >
                    Revisar e aprovar músicas →
                  </a>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {shouldShowRehearsalReminder && (
        <Card className="border-purple-200 bg-purple-50/70 dark:bg-purple-900/20 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="text-base">Confirme sua presença no próximo ensaio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-1">
              <p>
                Data: <b>{format(new Date(nextRehearsal.dateTime), "dd/MM/yyyy", { locale: ptBR })}</b>
              </p>
              <p>
                Horário: <b>{format(new Date(nextRehearsal.dateTime), "HH:mm", { locale: ptBR })}</b>
              </p>
              <p>
                Local: <b>{nextRehearsal.location || "Não definido"}</b>
              </p>
              <p>
                Status atual: <Badge variant="outline">PENDENTE</Badge>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleConfirmNextRehearsal} disabled={confirmingRehearsal}>
                {confirmingRehearsal && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar presença
              </Button>
              <Link 
                href={`/ensaios/${nextRehearsal.id}`}
                className="inline-flex items-center justify-center rounded-lg font-medium transition-all px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Ver ensaio
              </Link>
            </div>
          </CardContent>
        </Card>
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
            <Link href="/billing-admin">
              <Button variant="outline">
                💳 Gerenciar Planos
              </Button>
            </Link>
            <Link href="/multitracks-admin">
              <Button variant="outline">🎧 Multitracks</Button>
            </Link>
            <Link href="/pads-admin">
              <Button variant="outline">🎹 Pads</Button>
            </Link>
            <Link href="/cupons">
              <Button variant="outline">🎟️ Cupons</Button>
            </Link>
            <Link href="/auditoria">
              <Button variant="outline">🔍 Auditoria</Button>
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
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--accent) / 0.35)" }} />
                    <Area
                      type="monotone"
                      dataKey="setlistsCreated"
                      fill="hsl(var(--chart-2))"
                      stroke="hsl(var(--chart-2))"
                      fillOpacity={0.2}
                      name="Escalas criadas"
                    />
                    <Bar dataKey="newGroups" fill="hsl(var(--chart-1))" name="Novas igrejas" radius={[6, 6, 0, 0]} barSize={26} />
                    <Line type="monotone" dataKey="newGroups" stroke="hsl(var(--chart-3))" dot={{ r: 4 }} />
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
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--accent) / 0.35)" }} />
                    <Bar dataKey="usage" fill="hsl(var(--chart-2))" name="Escalas" radius={[4, 4, 0, 0]} />
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

      {userRole !== "SUPERADMIN" && (
        <>
          {showQuickActions && (
            <Card className="rounded-xl border border-border/80">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que fazer agora</p>
                    <p className="text-base font-semibold">Seu ministério não para.</p>
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

          {(userRole === "ADMIN" || userRole === "LEADER") && (
            <MinistryInsightsCard />
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






          {/* Meu Desenvolvimento — visível para todos os membros que tiverem avaliação */}
          {myEvaluation?.criteria && (
            <Card className="rounded-xl border border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="text-lg">⭐</span>
                  Meu Desenvolvimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const LABELS: Record<string, string> = {
                    afinacao: "Afinação",
                    tecnicaVocal: "Técnica vocal",
                    dominioInstrumental: "Domínio instrumental",
                    conhecimentoMusical: "Conhecimento musical",
                    pontualidade: "Pontualidade",
                    comprometimento: "Comprometimento",
                  };
                  const criteria = myEvaluation.criteria as Record<string, number>;
                  const avg = Object.values(criteria).reduce((a, b) => a + b, 0) / Object.values(criteria).length;
                  const getBadge = (val: number) => {
                    if (val >= 5) return { label: "Excelente", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" };
                    if (val >= 4) return { label: "Bom", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
                    if (val >= 3) return { label: "Regular", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" };
                    return { label: "Melhorar", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
                  };

                  return (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground">Média geral</span>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(n => (
                              <span key={n} className={`text-base ${n <= Math.round(avg) ? "text-yellow-400" : "text-muted-foreground/20"}`}>★</span>
                            ))}
                          </div>
                          <span className="text-sm font-medium">{avg.toFixed(1)}/5</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {Object.entries(criteria).map(([key, val]) => {
                          const badge = getBadge(val);
                          return (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-sm text-muted-foreground w-40 flex-shrink-0">{LABELS[key] ?? key}</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all"
                                  style={{ width: `${(val / 5) * 100}%` }}
                                />
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badge.color}`}>
                                {badge.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {Object.values(criteria).some(v => v < 3) && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-2">Pontos para desenvolver:</p>
                          <Link href="/professor">
                            <Button size="sm" variant="outline" className="w-full gap-2">
                              <span>🎓</span> Ver plano de desenvolvimento no Professor IA
                            </Button>
                          </Link>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}





        </>
      )}
    </div>
  );
}
