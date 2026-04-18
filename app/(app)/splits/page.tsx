"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Scissors, Upload, Loader2, Music2, Headphones, Layers, Mic2,
  Guitar, Piano, Drumstick, Zap, Clock, CheckCircle2, XCircle,
  Play, Pause, Volume2, VolumeX, Download, ChevronDown, ChevronRight,
  Timer, MapPin, Lock, ArrowUpRight, RefreshCw, AlertCircle, Trash2,
  ShoppingCart, Globe, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface SplitStem { id: string; label: string; displayName: string; type: string; }
interface SplitJob {
  id: string; songName: string; artistName: string | null; status: string;
  bpm: number | null; musicalKey: string | null; sections: any[] | null;
  createdAt: string; durationSec: number | null; errorMessage: string | null;
  stems: SplitStem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; progress: number }> = {
  PENDING:    { label: "Na fila",            color: "text-slate-400",   icon: Clock,        progress: 5  },
  UPLOADING:  { label: "Enviando...",         color: "text-blue-400",    icon: Loader2,      progress: 15 },
  PROCESSING: { label: "Separando stems...",  color: "text-violet-400",  icon: Loader2,      progress: 50 },
  ANALYZING:  { label: "Analisando música...",color: "text-amber-400",   icon: Loader2,      progress: 75 },
  GENERATING: { label: "Gerando guia...",     color: "text-emerald-400", icon: Loader2,      progress: 90 },
  DONE:       { label: "Concluído",           color: "text-emerald-500", icon: CheckCircle2, progress: 100 },
  FAILED:     { label: "Erro",                color: "text-red-400",     icon: XCircle,      progress: 0  },
};

const STEM_ICONS: Record<string, any> = {
  vocals: Mic2, "vocals@0": Mic2, "vocals@1": Mic2,
  drum: Drumstick, bass: Music2, piano: Piano,
  electric_guitar: Guitar, acoustic_guitar: Guitar,
  synthesizer: Zap, strings: Music2, wind: Music2,
  no_vocals: Layers, metronome: Timer, guide: MapPin,
};

const STEM_OPTIONS = [
  { value: "vocals",          label: "Vocais",          icon: Mic2 },
  { value: "drum",            label: "Bateria",         icon: Drumstick },
  { value: "bass",            label: "Baixo",           icon: Music2 },
  { value: "piano",           label: "Piano",           icon: Piano },
  { value: "electric_guitar", label: "Guitarra",        icon: Guitar },
  { value: "acoustic_guitar", label: "Violão",          icon: Guitar },
  { value: "synthesizer",     label: "Sintetizador",    icon: Zap },
];

function StemRow({ stem, jobId }: { stem: SplitStem; jobId: string }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const typeColors: Record<string, string> = {
    INSTRUMENT: "border-primary/30 bg-primary/5",
    BACKING:    "border-violet-500/30 bg-violet-500/5",
    METRONOME:  "border-amber-500/30 bg-amber-500/5",
    GUIDE:      "border-emerald-500/30 bg-emerald-500/5",
  };

  const getUrl = async () => {
    const res = await fetch(`/api/splits/audio?stemId=${stem.id}`);
    const d = await res.json();
    return d.url as string;
  };

  const togglePlay = async () => {
    if (loading) return;
    if (!audioRef.current) {
      setLoading(true);
      try {
        const url = await getUrl();
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => setPlaying(false);
      } finally { setLoading(false); }
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const handleDownload = async () => {
    const url = await getUrl();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stem.displayName}.wav`;
    a.click();
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const Icon = STEM_ICONS[stem.label] ?? Music2;

  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 transition-all", typeColors[stem.type] ?? "border-border bg-card")}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-background/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{stem.displayName}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{stem.type === "INSTRUMENT" ? "Stem" : stem.type === "BACKING" ? "Backing" : stem.type === "METRONOME" ? "Metrônomo" : "Guia"}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setMuted(v => !v)}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-background/50 transition-colors">
          {muted ? <VolumeX className="h-3.5 w-3.5 text-muted-foreground" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <button onClick={togglePlay}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-background/50 transition-colors">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button onClick={handleDownload}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-background/50 transition-colors">
          <Download className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function JobCard({ job, onRefresh, onOpen, onDelete }: { job: SplitJob; onRefresh: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(job.status === "DONE");
  const [cancelling, setCancelling] = useState(false);
  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = cfg.icon;
  const isActive = !["DONE", "FAILED"].includes(job.status);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => onRefresh(), 5000);
    return () => clearInterval(interval);
  }, [isActive]);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Cancelar este split?")) return;
    setCancelling(true);
    try {
      await fetch(`/api/splits?id=${job.id}`, { method: "DELETE" });
      onRefresh();
    } finally { setCancelling(false); }
  };

  const stemGroups = {
    vocals:    job.stems.filter(s => s.label.startsWith("vocal")),
    backing:   job.stems.filter(s => s.type === "BACKING"),
    instr:     job.stems.filter(s => s.type === "INSTRUMENT" && !s.label.startsWith("vocal")),
    special:   job.stems.filter(s => ["METRONOME", "GUIDE"].includes(s.type)),
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{job.songName}</p>
            {job.artistName && <span className="text-xs text-muted-foreground truncate">— {job.artistName}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn("flex items-center gap-1 text-xs font-medium", cfg.color)}>
              <StatusIcon className={cn("h-3 w-3", isActive && "animate-spin")} />
              {cfg.label}
            </span>
            {job.bpm && <span className="text-[11px] text-muted-foreground">{Math.round(job.bpm)} BPM</span>}
            {job.musicalKey && <span className="text-[11px] text-muted-foreground">{job.musicalKey}</span>}
            {job.stems.length > 0 && <span className="text-[11px] text-muted-foreground">{job.stems.length} faixas</span>}
          </div>
        </div>
        {job.status === "DONE" && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onOpen(job.id); }}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/20 transition-colors">
              <Play className="h-3 w-3" />Player
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(job.id); }}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {job.status === "FAILED" && (
          <button onClick={e => { e.stopPropagation(); onDelete(job.id); }}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 transition-colors flex-shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {isActive && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-20">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-1000" style={{ width: `${cfg.progress}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground text-center mt-0.5">{cfg.progress}%</p>
            </div>
            <button onClick={handleCancel} disabled={cancelling}
              className="h-7 w-7 flex items-center justify-center rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
              title="Cancelar">
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
        {!isActive && (
          <div className="h-7 w-7 flex-shrink-0 flex items-center justify-center">
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        )}
      </div>

      {isActive && (
        <div className="px-4 pb-3">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary/50 animate-pulse" style={{ width: `${cfg.progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{cfg.label} — isso pode levar alguns minutos...</p>
        </div>
      )}

      {job.status === "FAILED" && (
        <div className="px-4 pb-3">
          <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />{job.errorMessage || "Erro no processamento"}</p>
        </div>
      )}


    </div>
  );
}

export default function SplitsPage() {
  const { data: session } = useSession() || {};
  const { t } = useI18n();
  const user = session?.user as SessionUser | undefined;

  const router = useRouter();
  const [jobs, setJobs] = useState<SplitJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [blockedByPermission, setBlockedByPermission] = useState(false);
  const [quota, setQuota] = useState(0);
  const [usedThisMonth, setUsedThisMonth] = useState(0);

  // Catálogo público
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  // Verificação de duplicata
  const [duplicateCheck, setDuplicateCheck] = useState<{ duplicate: boolean; location?: string; message?: string; job?: any; priceInCents?: number } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Upload form
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [songName, setSongName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedStems, setSelectedStems] = useState<string[]>(["vocals", "drum", "bass", "piano"]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este split?")) return;
    await fetch(`/api/splits?id=${id}&action=delete`, { method: "DELETE" });
    setJobs(prev => prev.filter(j => j.id !== id));
    toast.success("Split removido");
  };

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/splits");
      if (res.status === 403) {
        setBlockedByPermission(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setHasAccess(data.hasAccess ?? false);
      setQuota(data.quota ?? 0);
      setUsedThisMonth(data.usedThisMonth ?? 0);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchJobs(); fetchCatalog(); }, [fetchJobs]);

  const fetchCatalog = async (search = "") => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`/api/splits/catalog?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setCatalog(data.catalog ?? []);
    } catch {}
    finally { setLoadingCatalog(false); }
  };

  const checkDuplicate = async (name: string, artist: string) => {
    if (!name.trim()) { setDuplicateCheck(null); return; }
    setCheckingDuplicate(true);
    try {
      const res = await fetch(`/api/splits/check-duplicate?songName=${encodeURIComponent(name)}&artistName=${encodeURIComponent(artist)}`);
      const data = await res.json();
      setDuplicateCheck(data.duplicate ? data : null);
    } catch {}
    finally { setCheckingDuplicate(false); }
  };

  const handleBuyCatalog = async (jobId: string) => {
    setBuyingId(jobId);
    try {
      // Redirecionar para checkout Stripe
      const res = await fetch("/api/splits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao iniciar compra"); return; }
      if (data.url) {
        window.location.href = data.url; // redirecionar para Stripe
      }
    } finally { setBuyingId(null); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!songName) setSongName(f.name.replace(/\.[^.]+$/, "")); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); if (!songName) setSongName(f.name.replace(/\.[^.]+$/, "")); }
  };

  const handleSubmit = async () => {
    if (!file || !songName.trim()) { toast.error("Selecione um arquivo e informe o nome da música"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("songName", songName.trim());
      form.append("artistName", artistName.trim());
      form.append("stems", selectedStems.join(","));
      const res = await fetch("/api/splits", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || data.error || "Erro ao enviar"); return; }
      toast.success("Split iniciado! Você será notificado quando concluir.");
      setFile(null); setSongName(""); setArtistName("");
      fetchJobs();
    } finally { setUploading(false); }
  };

  if (blockedByPermission && !loading) return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Scissors className="h-5 w-5 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Split de músicas</h1><p className="text-sm text-muted-foreground">Separe qualquer música em stems com IA</p></div>
      </div>
      <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-4">
        <Lock className="h-12 w-12 text-muted-foreground/20 mx-auto" />
        <div>
          <h3 className="font-semibold text-lg">Acesso restrito</h3>
          <p className="text-sm text-muted-foreground mt-1">Você não tem permissão para acessar o Split de músicas. Fale com o líder do seu ministério.</p>
        </div>
      </div>
    </div>
  );

  if (!hasAccess && !loading) return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Scissors className="h-5 w-5 text-primary" /></div>
        <div><h1 className="text-2xl font-bold">Split de músicas</h1><p className="text-sm text-muted-foreground">Separe qualquer música em stems com IA</p></div>
      </div>
      <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-4">
        <Lock className="h-12 w-12 text-muted-foreground/20 mx-auto" />
        <div>
          <h3 className="font-semibold text-lg">Recurso Premium</h3>
          <p className="text-sm text-muted-foreground mt-1">Split de músicas está disponível nos planos <strong>Avançado</strong> e <strong>Igreja</strong>.</p>
        </div>
        <Button onClick={() => window.open("/planos", "_blank")}><ArrowUpRight className="h-4 w-4 mr-1.5" />Ver planos</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Scissors className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold">Split de músicas</h1>
            <p className="text-sm text-muted-foreground">Stems separados com IA + metrônomo e guia automáticos</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{usedThisMonth}<span className="text-muted-foreground text-sm font-normal">/{quota}</span></p>
          <p className="text-xs text-muted-foreground">este mês</p>
        </div>
      </div>

      {/* Upload */}
      {usedThisMonth < quota && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">Nova separação</h2>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20",
              file && "border-emerald-500/40 bg-emerald-500/5"
            )}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <Music2 className="h-5 w-5 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-500">{file.name}</p>
                <p className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Arraste o arquivo ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground/60 mt-1">MP3, WAV, M4A, FLAC ou OGG • Máx. 50MB</p>
              </>
            )}
            <input ref={fileInputRef} type="file" accept=".mp3,.wav,.m4a,.flac,.ogg,audio/*" onChange={handleFileChange} className="hidden" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da música *</label>
              <Input value={songName} onChange={e => setSongName(e.target.value)} placeholder={t("splits.songNamePlaceholder")} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Artista</label>
              <Input value={artistName} onChange={e => setArtistName(e.target.value)} placeholder={t("splits.artistPlaceholder")} />
            </div>
          </div>

          {/* Seleção de stems */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Stems a separar</label>
            <div className="flex flex-wrap gap-2">
              {STEM_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setSelectedStems(prev =>
                    prev.includes(opt.value) ? prev.filter(s => s !== opt.value) : [...prev, opt.value]
                  )}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                    selectedStems.includes(opt.value)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/20"
                  )}>
                  <opt.icon className="h-3 w-3" />{opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Metrônomo e guia de seções são sempre gerados automaticamente.
              {selectedStems.length > 0 && ` Custo: ${selectedStems.length}× duração da música.`}
            </p>
          </div>

          {/* Aviso de duplicata */}
          {checkingDuplicate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando catálogo...
            </div>
          )}
          {duplicateCheck && !checkingDuplicate && (
            <div className={cn("rounded-xl border p-3 text-sm",
              duplicateCheck.location === "own"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
            )}>
              <div className="flex items-start gap-2">
                {duplicateCheck.location === "own"
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
                  : <Globe className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                }
                <div className="flex-1">
                  <p className="font-medium mb-1">{duplicateCheck.message}</p>
                  {duplicateCheck.location === "catalog" && duplicateCheck.job && (
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs opacity-75">
                        {duplicateCheck.job.stems?.length} stems
                        {duplicateCheck.job.bpm && ` · ${duplicateCheck.job.bpm} BPM`}
                        {duplicateCheck.job.musicalKey && ` · ${duplicateCheck.job.musicalKey}`}
                      </div>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
                        onClick={() => handleBuyCatalog(duplicateCheck.job.id)}
                        disabled={buyingId === duplicateCheck.job.id}>
                        {buyingId === duplicateCheck.job.id
                          ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          : <ShoppingCart className="h-3 w-3 mr-1" />}
                        Adquirir por R${((duplicateCheck.priceInCents ?? 490) / 100).toFixed(2).replace(".", ",")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">O processamento leva ~5 minutos. Você pode fechar esta página.</p>
            <Button onClick={handleSubmit}
              disabled={!file || !songName.trim() || uploading || selectedStems.length === 0 || duplicateCheck?.location === "own"}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Scissors className="h-4 w-4 mr-1.5" />}
              Separar stems
            </Button>
          </div>
        </div>
      )}

      {/* Catálogo de splits disponíveis */}
      {catalog.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">Catálogo de Splits</h2>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">{catalog.length}</span>
            </div>
            <div className="relative">
              <input type="text" placeholder="Buscar no catálogo..."
                value={catalogSearch}
                onChange={e => { setCatalogSearch(e.target.value); fetchCatalog(e.target.value); }}
                className="h-8 w-48 rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Acesse splits já processados por outros ministérios. R$ 4,90 por acesso.
          </p>
          <div className="space-y-2">
            {loadingCatalog ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : catalog.filter(j => !j.alreadyOwned).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum split disponível no catálogo.</p>
            ) : catalog.filter(j => !j.alreadyOwned).map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.songName}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {item.artistName && <span>{item.artistName}</span>}
                    {item.bpm && <span className="bg-muted rounded px-1.5 py-0.5">{item.bpm} BPM</span>}
                    {item.musicalKey && <span className="bg-muted rounded px-1.5 py-0.5">{item.musicalKey}</span>}
                    <span className="bg-muted rounded px-1.5 py-0.5">{item.stemsCount} stems</span>
                  </div>
                  {item.stems?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.stems.map((s: string) => (
                        <span key={s} className="text-[10px] bg-primary/5 text-primary border border-primary/10 rounded px-1.5 py-0.5">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline"
                  onClick={() => handleBuyCatalog(item.id)}
                  disabled={buyingId === item.id}
                  className="flex-shrink-0 text-xs gap-1">
                  {buyingId === item.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ShoppingCart className="h-3.5 w-3.5" />}
                  R$ {((item.priceInCents ?? 490) / 100).toFixed(2).replace(".", ",")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* O que é gerado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Mic2, label: "Vocais isolados", desc: "Voz principal e backing vocals" },
          { icon: Drumstick, label: "Instrumentos", desc: "Bateria, baixo, guitarra, piano..." },
          { icon: Timer, label: "Metrônomo", desc: "Clique gerado no BPM da música" },
          { icon: MapPin, label: "Guia de seções", desc: "Voz indicando intro, verso, refrão..." },
        ].map((f, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/50 p-3 flex items-start gap-2.5">
            <f.icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold">{f.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista de jobs */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Scissors className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma separação ainda. Envie sua primeira música!</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Histórico</h2>
            <Button variant="ghost" size="sm" onClick={fetchJobs}><RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar</Button>
          </div>
          {jobs.map(job => <JobCard key={job.id} job={job} onRefresh={fetchJobs} onOpen={id => router.push(`/splits/${id}`)} onDelete={handleDelete} />)}
        </div>
      )}
    </div>
  );
}
