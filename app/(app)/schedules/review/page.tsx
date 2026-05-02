"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Music, Users, Clock, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const KEYS = ["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B","Cm","C#m","Dbm","Dm","D#m","Ebm","Em","Fm","F#m","Gbm","Gm","G#m","Abm","Am","A#m","Bbm","Bm"];

interface Song {
  id: string;
  title: string;
  artist: string | null;
  bpm: number | null;
  key: string | null;
  originalKey: string | null;
}

interface ScheduleData {
  id: string;
  date: string;
  name: string | null;
  status: string;
  group: { name: string; scheduleApprovalDeadlineDays: number | null };
  songs: Song[];
  roles: { role: string; memberName: string | null }[];
  ministerName: string | null;
  deadlineDate: string | null;
}

export default function ScheduleReviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const scheduleId = searchParams.get("id");

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scheduleId) return;
    fetch(`/api/schedules/review?id=${scheduleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setSchedule(data);
        setSongs(data.songs ?? []);
        if (data.status === "APPROVED" || data.status === "PUBLISHED") {
          setApproved(true);
        }
      })
      .catch(() => setError("Erro ao carregar escala"))
      .finally(() => setLoading(false));
  }, [scheduleId]);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...songs];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setSongs(next);
  }

  function moveDown(idx: number) {
    if (idx === songs.length - 1) return;
    const next = [...songs];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setSongs(next);
  }

  function updateKey(idx: number, key: string) {
    const next = [...songs];
    next[idx] = { ...next[idx], key };
    setSongs(next);
  }

  async function handleApprove() {
    if (!scheduleId) return;
    setApproving(true);
    try {
      const res = await fetch("/api/schedules/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId,
          action: "approve",
          songs: songs.map((s, i) => ({ id: s.id, key: s.key, position: i })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApproved(true);
        toast.success("Escala aprovada! A equipe será notificada.");
      } else {
        toast.error(data.error ?? "Erro ao aprovar");
      }
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-red-500 font-medium">{error}</p>
          <button onClick={() => router.push("/schedules")} className="text-sm text-muted-foreground hover:text-foreground">
            Ir para escalas
          </button>
        </div>
      </div>
    );
  }

  if (!schedule) return null;

  const scheduleDate = format(new Date(schedule.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const deadlineDays = schedule.group.scheduleApprovalDeadlineDays ?? 1;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-purple-500/10 text-purple-500 px-2 py-1 rounded-full font-medium">
            {schedule.group.name}
          </span>
          {schedule.status === "PENDING_APPROVAL" && (
            <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full font-medium">
              Aguardando sua aprovação
            </span>
          )}
          {(schedule.status === "APPROVED" || schedule.status === "PUBLISHED") && (
            <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-full font-medium flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />Aprovada
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold capitalize">{scheduleDate}</h1>
        {schedule.name && <p className="text-muted-foreground">{schedule.name}</p>}
      </div>

      {/* Aviso de prazo */}
      {schedule.status === "PENDING_APPROVAL" && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Revisão necessária</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Revise e aprove as músicas abaixo. Se não houver aprovação até <strong>{deadlineDays} dia{deadlineDays !== 1 ? "s" : ""} antes do culto</strong>, a escala será publicada automaticamente para a equipe.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Músicas */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Music className="h-4 w-4 text-purple-500" />
          Músicas da escala
          {schedule.status === "PENDING_APPROVAL" && (
            <span className="text-xs text-muted-foreground font-normal">— reordene ou altere o tom se necessário</span>
          )}
        </h2>

        {songs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma música selecionada ainda.</p>
        ) : (
          <div className="space-y-2">
            {songs.map((song, idx) => (
              <div key={song.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <span className="text-lg font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{song.title}</p>
                  {song.artist && <p className="text-sm text-muted-foreground">{song.artist}</p>}
                </div>

                {/* Seletor de tom */}
                <div className="relative flex-shrink-0">
                  <select
                    value={song.key ?? song.originalKey ?? ""}
                    onChange={(e) => updateKey(idx, e.target.value)}
                    disabled={schedule.status !== "PENDING_APPROVAL"}
                    className="h-8 rounded-md border border-input bg-background px-2 pr-6 text-sm appearance-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  >
                    <option value="">Tom</option>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                </div>

                {/* Reordenar */}
                {schedule.status === "PENDING_APPROVAL" && (
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveDown(idx)} disabled={idx === songs.length - 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipe */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          Equipe do dia
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {schedule.roles.map((r, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{r.role}</p>
              <p className="font-medium text-sm mt-0.5">{r.memberName ?? "— Não atribuído"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Botão de aprovação */}
      {!approved && schedule.status === "PENDING_APPROVAL" && (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full py-3 rounded-xl bg-green-500 text-white font-semibold text-base hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {approving ? (
            "Aprovando..."
          ) : (
            <><CheckCircle className="h-5 w-5" />Aprovar escala e notificar equipe</>
          )}
        </button>
      )}

      {approved && (
        <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/20 p-4 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-800 dark:text-green-200">Escala aprovada!</p>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">A equipe foi notificada.</p>
        </div>
      )}
    </div>
  );
}
