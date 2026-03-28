"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { ModuleAccessOverlay } from "@/components/module-access-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  GraduationCap, Search, Users, CheckCircle2, XCircle, Loader2,
  BarChart3, Trophy, Target, TrendingUp, X,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface MemberCoachInfo {
  id: string; name: string; email: string; role: string;
  memberFunction: string | null; instruments: string[]; voiceType: string | null;
  coachEnabled: boolean; coachLevel: number; coachProfileId: string | null;
}

interface SubmissionProgress {
  id: string; type: string; instrument: string | null; createdAt: string;
  feedback: { score: number | null; feedback: string | null; metricsJson: unknown } | null;
}

interface MemberProgress {
  member: { id: string; name: string; email: string; memberFunction: string | null; instruments: string[]; voiceType: string | null; coachEnabled: boolean; level: number };
  submissions: SubmissionProgress[];
}

function MemberProgressModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const [data, setData] = useState<MemberProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30>(30);

  useEffect(() => {
    fetch(`/api/music-coach/config/${memberId}/progress`)
      .then((r) => r.json()).then(setData).catch(() => toast.error("Erro ao carregar progresso")).finally(() => setLoading(false));
  }, [memberId]);

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card rounded-2xl p-8 flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary" /><span>Carregando...</span></div>
    </div>
  );
  if (!data) return null;

  const { member, submissions } = data;
  const now = new Date();
  const cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
  const filtered = submissions.filter((s) => new Date(s.createdAt) >= cutoff);
  const chartData = filtered.filter((s) => s.feedback?.score != null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((s) => ({
      date: new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      vocal: s.type === "vocal" ? s.feedback!.score : null,
      instrumental: s.type === "instrumental" ? s.feedback!.score : null,
    }));

  const scores = submissions.filter((s) => s.feedback?.score != null).map((s) => s.feedback!.score!);
  const totalCount = submissions.length;
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const first3avg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.max(scores.slice(0, 3).length, 1);
  const last3avg = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.max(scores.slice(-3).length, 1);

  const badges = [
    { id: "first", icon: "🎵", label: "Primeira Prática", earned: totalCount >= 1 },
    { id: "five", icon: "🏅", label: "5 Práticas", earned: totalCount >= 5 },
    { id: "score80", icon: "⭐", label: "Nota 80+", earned: scores.some((s) => s >= 80) },
    { id: "score90", icon: "🏆", label: "Nota 90+", earned: scores.some((s) => s >= 90) },
    { id: "improve", icon: "📈", label: "Evolução 10pts", earned: scores.length >= 6 && last3avg - first3avg >= 10 },
  ];

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const thisWeek = submissions.filter((s) => new Date(s.createdAt) >= weekStart).length;
  const weekGoal = 3;
  const weekProgress = Math.min(thisWeek / weekGoal, 1);
  const earnedBadges = badges.filter((b) => b.earned).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Progresso — {member.name}</h2>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "Práticas", value: totalCount }, { label: "Média Geral", value: avgScore ?? "—" }, { label: "Conquistas", value: `${earnedBadges}/${badges.length}` }].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" />Evolução de Notas</p>
              <div className="flex gap-1">
                {([7, 30] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={cn("px-2.5 py-1 text-xs rounded-full border transition-colors", period === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}>{p}d</button>
                ))}
              </div>
            </div>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 bg-muted/30 rounded-xl">Nenhuma prática com nota no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="vocal" name="Vocal" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="instrumental" name="Instrumental" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Trophy className="h-4 w-4 text-primary" />Conquistas</p>
            <div className="grid grid-cols-5 gap-2">
              {badges.map((b) => (
                <div key={b.id} className={cn("flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center", b.earned ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-40")}>
                  <span className="text-xl">{b.icon}</span>
                  <p className="text-[10px] font-medium leading-tight">{b.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Target className="h-4 w-4 text-primary" />Meta Semanal</p>
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{thisWeek} de {weekGoal} práticas esta semana</span>
                <span className={cn("font-semibold", thisWeek >= weekGoal ? "text-emerald-400" : "text-primary")}>{Math.round(weekProgress * 100)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", thisWeek >= weekGoal ? "bg-emerald-400" : "bg-primary")} style={{ width: `${weekProgress * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                {thisWeek === 0 ? "Nenhuma prática esta semana." : thisWeek < weekGoal ? `Faltam ${weekGoal - thisWeek} prática(s) para a meta.` : "Meta da semana atingida! 🎉"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfessorConfigPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;
  const [members, setMembers] = useState<MemberCoachInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [progressMemberId, setProgressMemberId] = useState<string | null>(null);

  const [blockedByPlan, setBlockedByPlan] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const groupParam = user?.groupId ? `?groupId=${user.groupId}` : "";
      const res = await fetch(`/api/music-coach/config${groupParam}`);
      if (!res.ok) throw new Error();
      setMembers(await res.json());
    } catch { toast.error("Erro ao carregar membros"); }
    finally { setLoading(false); }
  }, [user?.groupId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || !["ADMIN", "SUPERADMIN"].includes(user.role)) { router.replace("/dashboard"); return; }

    // Verificar se o plano tem acesso ao Professor IA
    fetch("/api/subscription/status")
      .then(r => r.json())
      .then(data => {
        if (!data?.moduleAccess?.professor) {
          setBlockedByPlan(true);
          setLoading(false);
        } else {
          fetchMembers();
        }
      })
      .catch(() => fetchMembers());
  }, [status, user, router, fetchMembers]);

  const toggleMember = async (memberId: string, enabled: boolean) => {
    setSaving((prev) => ({ ...prev, [memberId]: true }));
    try {
      const res = await fetch("/api/music-coach/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [memberId], enabled, groupId: user?.groupId }) });
      if (!res.ok) throw new Error();
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, coachEnabled: enabled } : m)));
      toast.success(enabled ? "Professor habilitado" : "Professor desabilitado");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving((prev) => ({ ...prev, [memberId]: false })); }
  };

  const bulkToggle = async (enabled: boolean) => {
    setBulkLoading(true);
    try {
      const ids = filteredMembers.map((m) => m.id);
      const res = await fetch("/api/music-coach/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: ids, enabled, groupId: user?.groupId }) });
      if (!res.ok) throw new Error();
      setMembers((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, coachEnabled: enabled } : m)));
      toast.success(`${ids.length} membros ${enabled ? "habilitados" : "desabilitados"}`);
    } catch { toast.error("Erro ao salvar em lote"); }
    finally { setBulkLoading(false); }
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.memberFunction || "").toLowerCase().includes(search.toLowerCase())
  );
  const enabledCount = members.filter((m) => m.coachEnabled).length;

  if (status === "loading" || loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (blockedByPlan) {
    return (
      <div className="relative h-96">
        <ModuleAccessOverlay
          moduleLabel="Professor IA"
          isAdmin={user?.role === "ADMIN" || user?.role === "SUPERADMIN"}
          onUpgrade={() => router.push("/planos")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {progressMemberId && <MemberProgressModal memberId={progressMemberId} onClose={() => setProgressMemberId(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GraduationCap className="h-7 w-7 text-primary" />Configurar Professor</h1>
          <p className="text-muted-foreground mt-1">Habilite o módulo Professor para os membros do seu grupo.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-muted-foreground">{enabledCount} de {members.length} habilitados</span>
        </div>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Membros do Grupo</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkToggle(true)} disabled={bulkLoading}>{bulkLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Habilitar Todos</Button>
              <Button size="sm" variant="outline" onClick={() => bulkToggle(false)} disabled={bulkLoading}>Desabilitar Todos</Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome, email ou função..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum membro encontrado.</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.name}</p>
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{member.role}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {member.memberFunction && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">{member.memberFunction}</span>}
                      {member.instruments.map((inst) => <span key={inst} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400">{inst}</span>)}
                      {member.voiceType && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">{member.voiceType}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setProgressMemberId(member.id)} className="text-muted-foreground hover:text-primary" title="Ver progresso">
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    {member.coachEnabled ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                    <Switch checked={member.coachEnabled} onCheckedChange={(checked) => toggleMember(member.id, checked)} disabled={!!saving[member.id]} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
