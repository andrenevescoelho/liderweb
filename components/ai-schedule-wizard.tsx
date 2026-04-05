"use client";

import { useState } from "react";
import { format, addDays, nextSunday, startOfMonth, endOfMonth, eachWeekOfInterval, nextDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Sparkles, ChevronRight, ChevronLeft, Check, Calendar, Clock, Music, Users, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AiRole {
  role: string;
  memberId: string | null;
  memberName: string | null;
}

interface AiSong {
  songId: string;
  title: string;
  key: string;
}

interface AiSchedule {
  date: string;
  time: string | null;
  name: string | null;
  roles: AiRole[];
  songs: AiSong[];
  aiNotes?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (schedules: AiSchedule[]) => void;
}

// ── Helpers de data ──────────────────────────────────────────────────────────

function getNextSundays(n: number): string[] {
  const dates: string[] = [];
  let d = nextSunday(new Date());
  for (let i = 0; i < n; i++) {
    dates.push(format(d, "yyyy-MM-dd"));
    d = addDays(d, 7);
  }
  return dates;
}

function getSundaysOfMonth(monthOffset: number): string[] {
  const base = new Date();
  const target = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const start = startOfMonth(target);
  const end = endOfMonth(target);
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 0 });
  return weeks
    .map((w) => nextDay(w, 0))
    .filter((d) => d >= start && d <= end)
    .map((d) => format(d, "yyyy-MM-dd"));
}

function formatDateLabel(dateStr: string): string {
  return format(new Date(dateStr + "T12:00:00"), "EEE, dd 'de' MMM", { locale: ptBR });
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AiScheduleWizard({ isOpen, onClose, onAccept }: Props) {
  const [step, setStep] = useState<"config" | "loading" | "draft">("config");

  // Config
  const [period, setPeriod] = useState<"next_sunday" | "next_2" | "next_4" | "this_month" | "next_month" | "custom">("next_sunday");
  const [numServices, setNumServices] = useState(1);
  const [observation, setObservation] = useState("");
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [customDateInput, setCustomDateInput] = useState("");

  // Draft
  const [draft, setDraft] = useState<AiSchedule[]>([]);
  const [error, setError] = useState("");

  function getDates(): string[] {
    switch (period) {
      case "next_sunday": return getNextSundays(1);
      case "next_2": return getNextSundays(2);
      case "next_4": return getNextSundays(4);
      case "this_month": return getSundaysOfMonth(0);
      case "next_month": return getSundaysOfMonth(1);
      case "custom": return customDates;
    }
  }

  const dates = getDates();

  async function handleGenerate() {
    if (dates.length === 0) { setError("Selecione ao menos uma data."); return; }
    setError("");
    setStep("loading");

    try {
      const res = await fetch("/api/ai/suggest-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, dates, numServices, observation }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao gerar escala.");
        setStep("config");
        return;
      }

      setDraft(data.schedules ?? []);
      setStep("draft");
    } catch {
      setError("Erro de conexão. Tente novamente.");
      setStep("config");
    }
  }

  function handleAccept() {
    onAccept(draft);
    onClose();
    resetWizard();
  }

  function resetWizard() {
    setStep("config");
    setPeriod("next_sunday");
    setNumServices(1);
    setObservation("");
    setCustomDates([]);
    setCustomDateInput("");
    setDraft([]);
    setError("");
  }

  function handleClose() {
    onClose();
    resetWizard();
  }

  function addCustomDate() {
    if (!customDateInput) return;
    if (customDates.includes(customDateInput)) return;
    setCustomDates([...customDates, customDateInput].sort());
    setCustomDateInput("");
  }

  function removeCustomDate(d: string) {
    setCustomDates(customDates.filter((x) => x !== d));
  }

  function updateDraftRole(schedIdx: number, roleIdx: number, memberId: string, memberName: string) {
    setDraft((prev) => prev.map((s, si) =>
      si !== schedIdx ? s : {
        ...s,
        roles: s.roles.map((r, ri) =>
          ri !== roleIdx ? r : { ...r, memberId: memberId || null, memberName: memberName || null }
        ),
      }
    ));
  }

  function updateDraftName(schedIdx: number, value: string) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, name: value || null }));
  }

  function updateDraftTime(schedIdx: number, value: string) {
    setDraft((prev) => prev.map((s, si) => si !== schedIdx ? s : { ...s, time: value || null }));
  }

  function removeDraftSong(schedIdx: number, songIdx: number) {
    setDraft((prev) => prev.map((s, si) =>
      si !== schedIdx ? s : { ...s, songs: s.songs.filter((_, i) => i !== songIdx) }
    ));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        step === "loading" ? "Gerando escala..." :
        step === "draft" ? "Rascunho gerado pela IA" :
        "Gerar escala com IA"
      }
      className="max-w-2xl"
    >
      {/* ── Step: Config ── */}
      {step === "config" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Escolha o período e a IA vai sugerir uma escala com base nos membros e repertório do seu ministério.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Período */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Período</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { key: "next_sunday", label: "Próximo domingo" },
                { key: "next_2", label: "Próximos 2 domingos" },
                { key: "next_4", label: "Próximos 4 domingos" },
                { key: "this_month", label: "Este mês" },
                { key: "next_month", label: "Próximo mês" },
                { key: "custom", label: "Datas específicas" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key as any)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                    period === opt.key
                      ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      : "border-border bg-background hover:border-purple-400 text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Datas customizadas */}
          {period === "custom" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Selecionar datas</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={customDateInput}
                  onChange={(e) => setCustomDateInput(e.target.value)}
                  className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button type="button" size="sm" onClick={addCustomDate} disabled={!customDateInput}>
                  Adicionar
                </Button>
              </div>
              {customDates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customDates.map((d) => (
                    <Badge
                      key={d}
                      variant="info"
                      className="cursor-pointer"
                      onClick={() => removeCustomDate(d)}
                    >
                      {formatDateLabel(d)} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview das datas */}
          {dates.length > 0 && period !== "custom" && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datas selecionadas</p>
              <div className="flex flex-wrap gap-2">
                {dates.map((d) => (
                  <Badge key={d} variant="default" className="text-xs">{formatDateLabel(d)}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Cultos por data */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Cultos por data
            </label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumServices(n)}
                  className={`w-12 h-10 rounded-lg border text-sm font-medium transition-colors ${
                    numServices === n
                      ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      : "border-border bg-background text-muted-foreground hover:border-purple-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Observação */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Observação para a IA <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ex: Evitar colocar João e Maria juntos, priorizar músicas de adoração, o culto das 19h é mais jovem..."
              className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              maxLength={500}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancelar</Button>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={dates.length === 0}
              className="gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Gerar escala
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Loading ── */}
      {step === "loading" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-500 animate-pulse" />
            </div>
            <Loader2 className="w-5 h-5 text-purple-500 animate-spin absolute -top-1 -right-1" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium">Consultando membros e repertório...</p>
            <p className="text-sm text-muted-foreground">A IA está montando o melhor rascunho para você</p>
          </div>
        </div>
      )}

      {/* ── Step: Draft ── */}
      {step === "draft" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Revise o rascunho abaixo. Você pode editar qualquer campo antes de aceitar.
          </p>

          <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
            {draft.map((sched, si) => (
              <div key={si} className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                {/* Header da escala */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span className="font-semibold text-sm">
                    {formatDateLabel(sched.date)}
                  </span>
                  {sched.time && (
                    <Badge variant="info" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />{sched.time}
                    </Badge>
                  )}
                </div>

                {/* Editar nome e horário */}
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Nome do culto"
                    value={sched.name ?? ""}
                    onChange={(e) => updateDraftName(si, e.target.value)}
                    placeholder="Ex: Culto da Manhã"
                  />
                  <Input
                    label="Horário"
                    type="time"
                    value={sched.time ?? ""}
                    onChange={(e) => updateDraftTime(si, e.target.value)}
                  />
                </div>

                {/* Roles */}
                {sched.roles.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> Equipe sugerida
                    </p>
                    <div className="space-y-1">
                      {sched.roles.map((r, ri) => (
                        <div key={ri} className="flex items-center gap-2 text-sm">
                          <span className="w-28 flex-shrink-0 text-muted-foreground truncate">{r.role}</span>
                          <span className={`flex-1 font-medium ${r.memberId ? "text-foreground" : "text-muted-foreground italic"}`}>
                            {r.memberName ?? "Não atribuído"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Músicas */}
                {sched.songs.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Music className="w-3 h-3" /> Músicas sugeridas
                    </p>
                    <div className="space-y-1">
                      {sched.songs.map((s, si2) => (
                        <div key={si2} className="flex items-center justify-between text-sm">
                          <span className="truncate">{s.title}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {s.key && <Badge variant="default" className="text-xs">{s.key}</Badge>}
                            <button
                              type="button"
                              onClick={() => removeDraftSong(si, si2)}
                              className="text-muted-foreground hover:text-red-500 text-xs"
                            >
                              remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notas da IA */}
                {sched.aiNotes && (
                  <div className="rounded-md bg-purple-500/5 border border-purple-500/20 px-3 py-2">
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      {sched.aiNotes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep("config")}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Refazer
            </Button>
            <Button
              type="button"
              onClick={handleAccept}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              Aceitar e criar escalas
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
