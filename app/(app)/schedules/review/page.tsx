"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, Music, Users, Clock, ArrowUp, ArrowDown, ChevronDown, Plus, X, Search, Loader2 } from "lucide-react";
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
  reviewApprovalMode: string | null;
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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!scheduleId) return;
    fetch(`/api/schedules/review?id=${scheduleId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setSchedule(data);
        setSongs(data.songs ?? []);
        if (data.status === "APPROVED" || data.status === "PUBLISHED") setApproved(true);
      })
      .catch(() => setError("Erro ao carregar escala"))
      .finally(() => setLoading(false));
  }, [scheduleId]);

  const searchSongs = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/songs?search=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.songs ?? []);
        setSongs((current) => {
          setSearchResults(list.filter((s: Song) => !current.some((e) => e.id === s.id)));
          return current;
        });
      }
    } catch {}
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchSongs(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchSongs]);

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...songs]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; setSongs(next);
  }
  function moveDown(idx: number) {
    if (idx === songs.length - 1) return;
    const next = [...songs]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; setSongs(next);
  }
  function updateKey(idx: number, key: string) {
    const next = [...songs]; next[idx] = { ...next[idx], key }; setSongs(next);
  }
  function removeSong(idx: number) { setSongs(songs.filter((_, i) => i !== idx)); }
  function addSong(song: Song) {
    if (songs.some((s) => s.id === song.id)) return;
    setSongs((prev) => [...prev, { ...song, key: song.originalKey ?? null }]);
    setSearchResults((prev) => prev.filter((s) => s.id !== song.id));
    toast.success(`"${song.title}" adicionada`);
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setApproved(true);
        const msg = schedule?.reviewApprovalMode === "AUTO_PUBLISH"
          ? "Músicas aprovadas e escala publicada! A equipe foi notificada."
          : "Músicas aprovadas! O líder foi notificado para publicar.";
        toast.success(data.message ?? msg);
      } else {
        toast.error(data.error ?? "Erro ao aprovar");
      }
    } finally { setApproving(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-red-500 font-medium">{error}</p>
          <button onClick={() => router.push("/schedules")} className="text-sm text-muted-foreground hover:text-foreground">Ir para escalas</button>
        </div>
      </div>
    );
  }

  if (!schedule) return null;

  const isPending = schedule.status === "PENDING_APPROVAL";
  const scheduleDate = format(new Date(schedule.date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const deadlineDays = schedule.group.scheduleApprovalDeadlineDays ?? 1;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-purple-500/10 text-purple-500 px-2 py-1 rounded-full font-medium">{schedule.group.name}</span>
          {isPending && <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded-full font-medium">Aguardando sua aprovação</span>}
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
      {isPending && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Revisão necessária</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Revise o repertório abaixo — você pode adicionar, remover e reordenar músicas. Prazo: <strong>{deadlineDays} dia{deadlineDays !== 1 ? "s" : ""} antes do culto</strong>.
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {schedule.reviewApprovalMode === "AUTO_PUBLISH"
                  ? "✅ Após sua aprovação, a escala será publicada automaticamente para toda a equipe."
                  : "📩 Após sua aprovação, o líder será notificado para revisar e publicar."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Músicas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Music className="h-4 w-4 text-purple-500" />
            Músicas da escala
            <span className="text-xs text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded-full">{songs.length}</span>
          </h2>
          {isPending && (
            <button
              onClick={() => { setShowSearch((p) => !p); setSearchQuery(""); setSearchResults([]); }}
              className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              {showSearch ? <><X className="h-4 w-4" />Fechar</> : <><Plus className="h-4 w-4" />Adicionar música</>}
            </button>
          )}
        </div>

        {/* Busca do repertório */}
        {isPending && showSearch && (
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar no repertório do grupo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {searchResults.map((song) => (
                  <button key={song.id} onClick={() => addSong(song)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{song.title}</p>
                      {song.artist && <p className="text-xs text-muted-foreground truncate">{song.artist}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {song.originalKey && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{song.originalKey}</span>}
                      {song.bpm && <span className="text-xs text-muted-foreground">{song.bpm} BPM</span>}
                      <span className="text-xs text-purple-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">+ Adicionar</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length > 1 && !searching && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhuma música encontrada para "{searchQuery}"</p>
            )}
            {!searchQuery && (
              <p className="text-xs text-muted-foreground text-center">Digite o nome da música ou artista para buscar no repertório</p>
            )}
          </div>
        )}

        {/* Lista */}
        {songs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Music className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">Nenhuma música na escala.</p>
            {isPending && (
              <button onClick={() => setShowSearch(true)} className="mt-2 text-sm text-purple-600 hover:underline">
                Adicionar músicas do repertório
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {songs.map((song, idx) => (
              <div key={`${song.id}-${idx}`} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
                <span className="text-sm font-bold text-muted-foreground w-6 text-center flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{song.title}</p>
                  {song.artist && <p className="text-xs text-muted-foreground truncate">{song.artist}</p>}
                  {song.bpm && <p className="text-xs text-muted-foreground">{song.bpm} BPM</p>}
                </div>
                <div className="relative flex-shrink-0">
                  <select
                    value={song.key ?? song.originalKey ?? ""}
                    onChange={(e) => updateKey(idx, e.target.value)}
                    disabled={!isPending}
                    className="h-8 rounded-md border border-input bg-background px-2 pr-6 text-sm appearance-none focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  >
                    <option value="">Tom</option>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                </div>
                {isPending && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => moveDown(idx)} disabled={idx === songs.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                    </div>
                    <button onClick={() => removeSong(idx)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 hover:text-red-600 transition-colors" title="Remover">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipe — só visualização */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          Equipe do dia
          <span className="text-xs text-muted-foreground font-normal">(somente leitura)</span>
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

      {/* Aprovar */}
      {!approved && isPending && (
        <div className="space-y-3 pt-2">
          {songs.length === 0 && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800 p-3 text-sm text-orange-700 dark:text-orange-400 text-center">
              ⚠️ Adicione pelo menos uma música antes de aprovar.
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={approving || songs.length === 0}
            className="w-full py-3.5 rounded-xl bg-green-500 text-white font-semibold text-base hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {approving
              ? <><Loader2 className="h-5 w-5 animate-spin" />Aprovando...</>
              : <><CheckCircle className="h-5 w-5" />{schedule.reviewApprovalMode === "AUTO_PUBLISH" ? "Aprovar e publicar automaticamente" : "Aprovar músicas"}</>
            }
          </button>
        </div>
      )}

      {approved && (
        <div className="rounded-xl bg-green-50 border border-green-200 dark:bg-green-900/20 p-5 text-center space-y-1">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
          <p className="font-semibold text-green-800 dark:text-green-200">Escala aprovada!</p>
          <p className="text-sm text-green-700 dark:text-green-300">
            {schedule.reviewApprovalMode === "AUTO_PUBLISH"
              ? "A escala foi publicada e a equipe foi notificada."
              : "O líder foi notificado para publicar a escala."}
          </p>
        </div>
      )}
    </div>
  );
}
