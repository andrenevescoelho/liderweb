"use client";

import { useState, useEffect, useCallback } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, Sparkles, ChevronRight, ChevronLeft, Check, Calendar, Clock,
  Music, Users, AlertCircle, BookTemplate, Plus, Settings, Star, History, TrendingUp, Shuffle, UserCheck,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ── Tipos ────────────────────────────────────────────────────────────────────

type SongStrategy = "minister_history" | "group_top" | "exploration";

interface AiRole {
  role: string;
  memberId: string | null;
  memberName: string | null;
}

interface AiSong {
  songId: string;
  title: string;
  key: string;
  songReason?: string;
}

interface AiSchedule {
  date: string;
  time: string | null;
  name: string | null;
  roles: AiRole[];
  songs: AiSong[];
  aiNotes?: string;
}

interface ScheduleTemplate {
  id: string;
  name: string;
  dayOfWeek: number | null;
  defaultTime: string | null;
  songCount: number;
  bandType: string;
  roles: { role: string; count: number }[];
  isDefault: boolean;
}

interface Member {
  id: string;
  name: string;
}

// Data com ministro atribuído
interface DateMinister {
  date: string;
  ministerId: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (schedules: AiSchedule[]) => void;
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_NAMES_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const BAND_TYPE_LABELS: Record<string, string> = {
  full: "Banda completa",
  reduced: "Banda reduzida",
  vocals_only: "Somente vozes",
};

const SONG_STRATEGIES: {
  key: SongStrategy;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "group_top",
    label: "Mais usadas",
    description: "Músicas que o ministério mais usa no repertório",
    icon: <TrendingUp className="h-4 w-4" />,
  },
  {
    key: "minister_history",
    label: "Perfil do ministro",
    description: "IA usa o histórico de cada ministro por data",
    icon: <History className="h-4 w-4" />,
  },
  {
    key: "exploration",
    label: "Exploração",
    description: "Músicas esquecidas, não usadas há mais de 8 semanas",
    icon: <Shuffle className="h-4 w-4" />,
  },
];

// ── Helpers de data ──────────────────────────────────────────────────────────

function getDayOccurrences(dayOfWeek: number, monthOffset: number): string[] {
  const base = new Date();
  const start = startOfMonth(addMonths(base, monthOffset));
  const end = endOfMonth(start);
  return eachDayOfInterval({ start, end })
    .filter((d) => getDay(d) === dayOfWeek)
    .map((d) => format(d, "yyyy-MM-dd"));
}

function getNextOccurrences(dayOfWeek: number, count: number): string[] {
  const dates: string[] = [];
  let d = addDays(new Date(), 1);
  while (dates.length < count) {
    if (getDay(d) === dayOfWeek) dates.push(format(d, "yyyy-MM-dd"));
    d = addDays(d, 1);
  }
  return dates;
}

function formatDateLabel(dateStr: string): string {
  return format(new Date(dateStr + "T12:00:00"), "EEE, dd 'de' MMM", { locale: ptBR });
}

// ── Template Manager ─────────────────────────────────────────────────────────

function TemplateManager({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduleTemplate | null>(null);
  const [form, setForm] = useState({
    name: "", dayOfWeek: "" as string | number, defaultTime: "",
    songCount: 5, bandType: "full",
    roles: [
      { role: "Ministro", count: 1 },
      { role: "Vocal", count: 1 },
      { role: "Backing Vocal", count: 2 },
      { role: "Teclado", count: 1 },
      { role: "Violão", count: 1 },
    ] as { role: string; count: number }[],
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedule-templates");
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  function startEdit(t: ScheduleTemplate) {
    setEditing(t);
    setForm({
      name: t.name, dayOfWeek: t.dayOfWeek ?? "", defaultTime: t.defaultTime ?? "",
      songCount: t.songCount, bandType: t.bandType,
      roles: Array.isArray(t.roles) ? t.roles : [],
      isDefault: t.isDefault,
    });
  }

  function startNew() {
    setEditing({ id: "", name: "", dayOfWeek: null, defaultTime: null, songCount: 5, bandType: "full", roles: [], isDefault: false });
    setForm({ name: "", dayOfWeek: "", defaultTime: "", songCount: 5, bandType: "full", roles: [{ role: "Ministro", count: 1 }, { role: "Vocal", count: 1 }, { role: "Backing Vocal", count: 2 }], isDefault: false });
  }

  async function saveTemplate() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const payload = { ...form, dayOfWeek: form.dayOfWeek === "" ? null : Number(form.dayOfWeek) };
      const isNew = !editing?.id;
      const res = await fetch("/api/schedule-templates", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { id: editing?.id, ...payload }),
      });
      if (res.ok) {
        toast.success(isNew ? "Template criado!" : "Template atualizado!");
        setEditing(null);
        fetchTemplates();
      } else {
        toast.error("Erro ao salvar template");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Remover este template?")) return;
    const res = await fetch("/api/schedule-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success("Removido!"); fetchTemplates(); }
  }

  if (editing !== null) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-sm">{editing.id ? "Editar template" : "Novo template"}</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Nome do template</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Culto Domingo Manhã"
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Dia da semana</label>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Qualquer dia</option>
              {DAY_NAMES_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Horário padrão</label>
            <input type="time" value={form.defaultTime} onChange={(e) => setForm({ ...form, defaultTime: e.target.value })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Músicas a sugerir</label>
            <input type="number" min={1} max={15} value={form.songCount} onChange={(e) => setForm({ ...form, songCount: Number(e.target.value) })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de banda</label>
            <select value={form.bandType} onChange={(e) => setForm({ ...form, bandType: e.target.value })}
              className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {Object.entries(BAND_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted-foreground">Funções na escala</label>
            <button onClick={() => setForm({ ...form, roles: [...form.roles, { role: "", count: 1 }] })}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" />Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {form.roles.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input value={r.role} onChange={(e) => { const roles = [...form.roles]; roles[i] = { ...roles[i], role: e.target.value }; setForm({ ...form, roles }); }}
                  placeholder="Ex: Backing Vocal"
                  className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none" />
                <input type="number" min={1} max={10} value={r.count} onChange={(e) => { const roles = [...form.roles]; roles[i] = { ...roles[i], count: Number(e.target.value) }; setForm({ ...form, roles }); }}
                  className="w-14 h-8 rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none" />
                <button onClick={() => setForm({ ...form, roles: form.roles.filter((_, j) => j !== i) })}
                  className="text-muted-foreground hover:text-red-500 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded" />
          <span>Usar como template padrão</span>
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button size="sm" onClick={saveTemplate} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-sm">Templates de culto</h3>
        </div>
        <Button size="sm" onClick={startNew} className="gap-1">
          <Plus className="h-3.5 w-3.5" />Novo
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <BookTemplate className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Nenhum template criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  {t.isDefault && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {t.dayOfWeek !== null && <span className="text-xs text-muted-foreground">{DAY_NAMES_FULL[t.dayOfWeek]}</span>}
                  {t.defaultTime && <span className="text-xs text-muted-foreground">{t.defaultTime}</span>}
                  <span className="text-xs text-muted-foreground">{BAND_TYPE_LABELS[t.bandType]}</span>
                  <span className="text-xs text-muted-foreground">{t.songCount} músicas</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(t)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">Editar</button>
                <button onClick={() => deleteTemplate(t.id)} className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1 rounded hover:bg-muted">Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Wizard principal ─────────────────────────────────────────────────────────

export function AiScheduleWizard({ isOpen, onClose, onAccept }: Props) {
  const [step, setStep] = useState<"config" | "ministers" | "loading" | "draft" | "templates">("config");

  // Templates
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Estratégia
  const [songStrategy, setSongStrategy] = useState<SongStrategy>("group_top");

  // Período
  const [periodMode, setPeriodMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<"next_1" | "next_2" | "next_4" | "this_month" | "next_month" | "two_months">("next_4");
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [customDateInput, setCustomDateInput] = useState("");

  // Ministros por data (step 2)
  const [datesMinisters, setDatesMinisters] = useState<DateMinister[]>([]);

  // Observação
  const [observation, setObservation] = useState("");

  // Draft
  const [draft, setDraft] = useState<AiSchedule[]>([]);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingProgress, setLoadingProgress] = useState("");

  const fetchTemplates = useCallback(async () => {
    const res = await fetch("/api/schedule-templates").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setTemplates(data);
      const def = data.find((t: ScheduleTemplate) => t.isDefault);
      if (def) setSelectedTemplate(def.id);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchTemplates();
    fetch("/api/members?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.members ?? data.users ?? []);
        setMembers(list.map((m: any) => ({ id: m.id, name: m.name })));
      })
      .catch(() => {});
  }, [isOpen, fetchTemplates]);

  const template = templates.find((t) => t.id === selectedTemplate) ?? null;

  function getDates(): string[] {
    if (periodMode === "custom") return customDates;
    const dow = template?.dayOfWeek ?? 0;
    switch (preset) {
      case "next_1": return getNextOccurrences(dow, 1);
      case "next_2": return getNextOccurrences(dow, 2);
      case "next_4": return getNextOccurrences(dow, 4);
      case "this_month": return getDayOccurrences(dow, 0);
      case "next_month": return getDayOccurrences(dow, 1);
      case "two_months": return [...getDayOccurrences(dow, 1), ...getDayOccurrences(dow, 2)];
    }
  }

  const dates = getDates();

  // Avançar do step config → ministers (se minister_history) ou → loading
  function handleConfigNext() {
    if (dates.length === 0) { setError("Selecione ao menos uma data."); return; }
    setError("");

    if (songStrategy === "minister_history") {
      // Inicializar lista de datas com ministro null
      setDatesMinisters(dates.map((date) => ({ date, ministerId: null })));
      setStep("ministers");
    } else {
      handleGenerate(dates.map((date) => ({ date, ministerId: null })));
    }
  }

  function updateMinister(date: string, ministerId: string) {
    setDatesMinisters((prev) =>
      prev.map((dm) => dm.date === date ? { ...dm, ministerId: ministerId || null } : dm)
    );
  }

  async function handleGenerate(datesWithMinisters: DateMinister[]) {
    setStep("loading");
    setLoadingProgress(`Gerando 0/${datesWithMinisters.length} escalas...`);
    const results: AiSchedule[] = [];

    try {
      for (let i = 0; i < datesWithMinisters.length; i++) {
        const { date, ministerId } = datesWithMinisters[i];
        const ministerName = ministerId
          ? (members.find((m) => m.id === ministerId)?.name ?? null)
          : null;

        setLoadingProgress(
          `Gerando escala ${i + 1} de ${datesWithMinisters.length}${ministerName ? ` — ${ministerName}` : ""}...`
        );

        const res = await fetch("/api/ai/suggest-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dates: [date],
            templateId: selectedTemplate || null,
            observation,
            songStrategy,
            ministerId: ministerId || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          if (data.error === "SEM_REPERTORIO") {
            setError("⚠️ Seu ministério não tem músicas cadastradas no repertório. Acesse a seção Músicas e cadastre seu repertório antes de usar o wizard de IA.");
          } else {
            setError(data.error ?? "Erro ao gerar escala.");
          }
          setStep(songStrategy === "minister_history" ? "ministers" : "config");
          return;
        }
        results.push(...(data.schedules ?? []));
      }

      setDraft(results);
      setStep("draft");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStep(songStrategy === "minister_history" ? "ministers" : "config");
    }
  }

  function handleAccept() {
    onAccept(draft);
    onClose();
    resetWizard();
  }

  function resetWizard() {
    setStep("config");
    setPreset("next_4");
    setPeriodMode("preset");
    setObservation("");
    setCustomDates([]);
    setCustomDateInput("");
    setDraft([]);
    setError("");
    setLoadingProgress("");
    setSongStrategy("group_top");
    setDatesMinisters([]);
  }

  function handleClose() { onClose(); resetWizard(); }

  function addCustomDate() {
    if (!customDateInput || customDates.includes(customDateInput)) return;
    setCustomDates([...customDates, customDateInput].sort());
    setCustomDateInput("");
  }
  function removeCustomDate(d: string) { setCustomDates(customDates.filter((x) => x !== d)); }
  function updateDraftRole(schedIdx: number, roleIdx: number, memberId: string, memberName: string) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, roles: s.roles.map((r, ri) => ri !== roleIdx ? r : { ...r, memberId: memberId || null, memberName: memberName || null }) }));
  }
  function updateDraftName(schedIdx: number, value: string) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, name: value || null }));
  }
  function updateDraftTime(schedIdx: number, value: string) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, time: value || null }));
  }
  function removeDraftSong(schedIdx: number, songIdx: number) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, songs: s.songs.filter((_, i) => i !== songIdx) }));
  }

  const modalTitle =
    step === "templates" ? "Templates de culto" :
    step === "ministers" ? "Quem ministra em cada data?" :
    step === "loading" ? "Gerando escalas..." :
    step === "draft" ? "Rascunho gerado pela IA" :
    "Gerar escala com IA";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle} className="max-w-2xl">

      {/* ── Templates Manager ── */}
      {step === "templates" && (
        <TemplateManager onClose={() => { setStep("config"); fetchTemplates(); }} />
      )}

      {/* ── Config ── */}
      {step === "config" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Configure o template, a estratégia de músicas e o período.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Template */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Template de culto</label>
              <button onClick={() => setStep("templates")} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Settings className="h-3 w-3" />Gerenciar templates
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                <BookTemplate className="h-6 w-6 mx-auto mb-1 opacity-40" />
                Nenhum template criado.{" "}
                <button onClick={() => setStep("templates")} className="text-primary hover:underline">Criar agora</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button onClick={() => setSelectedTemplate("")}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${!selectedTemplate ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400" : "border-border bg-background hover:border-purple-400 text-muted-foreground"}`}>
                  <div className="font-medium">Sem template</div>
                  <div className="text-xs opacity-70">IA decide tudo</div>
                </button>
                {templates.map((t) => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${selectedTemplate === t.id ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400" : "border-border bg-background hover:border-purple-400 text-muted-foreground"}`}>
                    <div className="font-medium flex items-center gap-1">
                      {t.name}
                      {t.isDefault && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                    </div>
                    <div className="text-xs opacity-70">
                      {t.dayOfWeek !== null ? DAY_NAMES[t.dayOfWeek] : "Qualquer dia"}
                      {t.defaultTime ? ` · ${t.defaultTime}` : ""}
                      {` · ${t.songCount} músicas`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Estratégia */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Como a IA deve escolher as músicas?</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SONG_STRATEGIES.map((s) => (
                <button key={s.key} type="button" onClick={() => setSongStrategy(s.key)}
                  className={`rounded-lg border px-3 py-3 text-sm text-left transition-colors ${songStrategy === s.key ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400" : "border-border bg-background hover:border-purple-400 text-muted-foreground"}`}>
                  <div className="flex items-center gap-2 font-medium mb-1">{s.icon}{s.label}</div>
                  <div className="text-xs opacity-70 leading-snug">{s.description}</div>
                </button>
              ))}
            </div>
            {/* Hint quando minister_history selecionado */}
            {songStrategy === "minister_history" && (
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 flex items-start gap-2">
                <UserCheck className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  No próximo passo você vai definir qual ministro está em cada data. A IA vai buscar o histórico de cada um separadamente.
                </p>
              </div>
            )}
          </div>

          {/* Período */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Período</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { key: "next_1", label: `Próximo ${template?.dayOfWeek !== null && template?.dayOfWeek !== undefined ? DAY_NAMES_FULL[template.dayOfWeek] : "culto"}` },
                { key: "next_2", label: "Próximos 2" },
                { key: "next_4", label: "Próximos 4" },
                { key: "this_month", label: "Este mês" },
                { key: "next_month", label: "Próximo mês" },
                { key: "two_months", label: "2 meses" },
              ].map((opt) => (
                <button key={opt.key} type="button"
                  onClick={() => { setPeriodMode("preset"); setPreset(opt.key as any); }}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${periodMode === "preset" && preset === opt.key ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400" : "border-border bg-background hover:border-purple-400 text-muted-foreground"}`}>
                  {opt.label}
                </button>
              ))}
              <button type="button" onClick={() => setPeriodMode("custom")}
                className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${periodMode === "custom" ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400" : "border-border bg-background hover:border-purple-400 text-muted-foreground"}`}>
                Datas específicas
              </button>
            </div>
          </div>

          {/* Datas customizadas */}
          {periodMode === "custom" && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="date" value={customDateInput} onChange={(e) => setCustomDateInput(e.target.value)}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm" />
                <Button type="button" size="sm" onClick={addCustomDate} disabled={!customDateInput}>Adicionar</Button>
              </div>
              {customDates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customDates.map((d) => (
                    <Badge key={d} variant="info" className="cursor-pointer" onClick={() => removeCustomDate(d)}>
                      {formatDateLabel(d)} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview datas */}
          {dates.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {dates.length} culto{dates.length !== 1 ? "s" : ""} selecionado{dates.length !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {dates.map((d) => <Badge key={d} variant="default" className="text-xs">{formatDateLabel(d)}</Badge>)}
              </div>
            </div>
          )}

          {/* Observação */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Observação para a IA <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea value={observation} onChange={(e) => setObservation(e.target.value)}
              placeholder="Ex: Evitar colocar João e Maria juntos, priorizar músicas de adoração..."
              className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              maxLength={500} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
            <Button type="button" onClick={handleConfigNext} disabled={dates.length === 0} className="gap-2">
              {songStrategy === "minister_history" ? (
                <><UserCheck className="w-4 h-4" />Definir ministros<ChevronRight className="w-4 h-4" /></>
              ) : (
                <><Sparkles className="w-4 h-4" />Gerar {dates.length} escala{dates.length !== 1 ? "s" : ""}<ChevronRight className="w-4 h-4" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Ministers ── */}
      {step === "ministers" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Defina quem ministra em cada data. A IA vai buscar o histórico individual de cada ministro para sugerir as músicas certas.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="space-y-3">
            {datesMinisters.map((dm) => {
              const minister = members.find((m) => m.id === dm.ministerId);
              return (
                <div key={dm.date} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 w-36 flex-shrink-0">
                    <Calendar className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    <span className="text-sm font-medium">{formatDateLabel(dm.date)}</span>
                  </div>
                  <select
                    value={dm.ministerId ?? ""}
                    onChange={(e) => updateMinister(dm.date, e.target.value)}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Sem ministro definido —</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {/* Indicador de histórico */}
                  {minister && (
                    <div className="flex-shrink-0">
                      <Badge variant="info" className="text-xs gap-1">
                        <History className="h-3 w-3" />histórico
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Aviso sobre datas sem ministro */}
          {datesMinisters.some((dm) => !dm.ministerId) && (
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Datas sem ministro definido vão usar as músicas mais populares do ministério como base.
              </p>
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button type="button" variant="secondary" onClick={() => setStep("config")} className="gap-2">
              <ChevronLeft className="w-4 h-4" />Voltar
            </Button>
            <Button type="button" onClick={() => handleGenerate(datesMinisters)} className="gap-2">
              <Sparkles className="w-4 h-4" />
              Gerar {datesMinisters.length} escala{datesMinisters.length !== 1 ? "s" : ""}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {step === "loading" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-500 animate-pulse" />
            </div>
            <Loader2 className="w-5 h-5 text-purple-500 animate-spin absolute -top-1 -right-1" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium">{loadingProgress || "Consultando membros e repertório..."}</p>
            <p className="text-sm text-muted-foreground">A IA está montando o melhor rascunho para você</p>
          </div>
        </div>
      )}

      {/* ── Draft ── */}
      {step === "draft" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Revise o rascunho. Você pode editar qualquer campo antes de aceitar.
          </p>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {draft.map((sched, si) => (
              <div key={si} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span className="font-semibold text-sm">{formatDateLabel(sched.date)}</span>
                  {sched.time && <Badge variant="info" className="text-xs"><Clock className="w-3 h-3 mr-1" />{sched.time}</Badge>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Input label="Nome do culto" value={sched.name ?? ""} onChange={(e) => updateDraftName(si, e.target.value)} placeholder="Ex: Culto da Manhã" />
                  <Input label="Horário" type="time" value={sched.time ?? ""} onChange={(e) => updateDraftTime(si, e.target.value)} />
                </div>

                {sched.roles.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Equipe</p>
                    <div className="space-y-2">
                      {sched.roles.map((r, ri) => (
                        <div key={ri} className="flex items-center gap-2 text-sm">
                          <span className="w-28 flex-shrink-0 text-muted-foreground truncate text-xs">{r.role}</span>
                          <select value={r.memberId ?? ""} onChange={(e) => { const m = members.find((x) => x.id === e.target.value); updateDraftRole(si, ri, e.target.value, m?.name ?? ""); }}
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                            <option value="">— Não atribuído —</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sched.songs.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Music className="w-3 h-3" /> Músicas sugeridas</p>
                    <div className="space-y-1.5">
                      {sched.songs.map((s, si2) => (
                        <div key={si2} className="flex items-start justify-between text-sm gap-2">
                          <div className="min-w-0">
                            <span className="truncate block">{s.title}</span>
                            {s.songReason && (
                              <span className="text-xs text-muted-foreground italic">{s.songReason}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                            {s.key && <Badge variant="default" className="text-xs">{s.key}</Badge>}
                            <button type="button" onClick={() => removeDraftSong(si, si2)} className="text-muted-foreground hover:text-red-500 text-xs">remover</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sched.aiNotes && (
                  <div className="rounded-md bg-purple-500/5 border border-purple-500/20 px-3 py-2">
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      <Sparkles className="w-3 h-3 inline mr-1" />{sched.aiNotes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button type="button" variant="secondary" onClick={() => setStep(songStrategy === "minister_history" ? "ministers" : "config")} className="gap-2">
              <ChevronLeft className="w-4 h-4" />Refazer
            </Button>
            <Button type="button" onClick={handleAccept} className="gap-2">
              <Check className="w-4 h-4" />Aceitar e criar escalas
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
