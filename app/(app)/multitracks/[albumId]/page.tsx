"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Loader2, ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface StemTrack {
  name: string;
  url: string;
  volume: number;
  pan: number; // -1 (L) a 1 (R)
  muted: boolean;
  solo: boolean;
  loading: boolean;
  ready: boolean;
  color: string;
  waveformData: number[] | null;
}

interface Marker {
  label: string;
  time: number;
  color: string;
}

interface AlbumInfo {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  musicalKey: string | null;
  coverUrl: string | null;
}

// Cores vibrantes estilo DAW
const STEM_COLORS = [
  "#8B5CF6", // violet  — Click
  "#6366F1", // indigo  — Guia
  "#EF4444", // red     — Vocal
  "#F59E0B", // amber   — Drums
  "#84CC16", // lime    — Bass
  "#10B981", // emerald — Guitar
  "#06B6D4", // cyan    — Keys
  "#F97316", // orange  — Pad
  "#EC4899", // pink    — Strings
  "#14B8A6", // teal    — Loop
];

// Stems que ficam sempre no topo
const PRIORITY_STEMS = ["click", "guia", "guide", "clik"];

function isPriority(name: string) {
  return PRIORITY_STEMS.some((p) => name.toLowerCase().includes(p));
}

async function generateWaveform(buffer: AudioBuffer, samples = 200): Promise<number[]> {
  const raw = buffer.getChannelData(0);
  const blockSize = Math.floor(raw.length / samples);
  const waveform: number[] = [];
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(raw[i * blockSize + j]);
    }
    waveform.push(sum / blockSize);
  }
  const max = Math.max(...waveform, 0.001);
  return waveform.map((v) => v / max);
}

function WaveformBar({ data, progress, color }: { data: number[]; progress: number; color: string }) {
  const width = 100;
  const height = 48;
  const barW = width / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-12">
      {data.map((v, i) => {
        const barH = Math.max(1, v * height * 0.9);
        const x = i * barW;
        const y = (height - barH) / 2;
        const played = (i / data.length) < progress;
        return (
          <rect
            key={i}
            x={x + barW * 0.1}
            width={barW * 0.8}
            y={y}
            height={barH}
            fill={played ? color : `${color}55`}
            rx={barW * 0.2}
          />
        );
      })}
    </svg>
  );
}

const CACHE_NAME = "liderweb-multitracks-v1";
const CACHE_TTL_DAYS = 7;

async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  if (typeof window === "undefined" || !("caches" in window)) {
    // Fallback para ambientes sem Cache API
    return fetch(url).then((r) => r.arrayBuffer());
  }

  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(url);

  // Verificar cache existente
  const cached = await cache.match(cacheKey);
  if (cached) {
    const cachedAt = cached.headers.get("x-cached-at");
    if (cachedAt) {
      const age = Date.now() - Number(cachedAt);
      const maxAge = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
      if (age < maxAge) {
        return cached.arrayBuffer();
      }
      // Cache expirado — remove
      await cache.delete(cacheKey);
    }
  }

  // Baixar e armazenar no cache
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = await response.arrayBuffer();

  // Salvar no cache com timestamp
  const cachedResponse = new Response(buffer.slice(0), {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/wav",
      "x-cached-at": String(Date.now()),
    },
  });
  await cache.put(cacheKey, cachedResponse);

  return buffer;
}

// Limpar entradas expiradas do cache
async function pruneExpiredCache() {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const maxAge = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    for (const key of keys) {
      const resp = await cache.match(key);
      const cachedAt = resp?.headers.get("x-cached-at");
      if (cachedAt && Date.now() - Number(cachedAt) > maxAge) {
        await cache.delete(key);
      }
    }
  } catch { /* silent */ }
}

export default function MultitracksPlayerPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const params = useParams();
  const albumId = params?.albumId as string;

  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [stems, setStems] = useState<StemTrack[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cachedStems, setCachedStems] = useState<Set<number>>(new Set());
  const [selectedStem, setSelectedStem] = useState<number | null>(null);

  useEffect(() => { pruneExpiredCache(); }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const buffersRef = useRef<AudioBuffer[]>([]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !albumId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/multitracks/${albumId}/stems`);
        if (!res.ok) { const d = await res.json(); toast.error(d.error); router.push("/multitracks"); return; }
        const data = await res.json();
        setAlbum(data.album);
        setExpiresAt(data.expiresAt);
        if (data.markers?.length > 0) setMarkers(data.markers);

        const rawStems = data.stems as { name: string; url: string }[];
        const sorted = [
          ...rawStems.filter((s) => isPriority(s.name)),
          ...rawStems.filter((s) => !isPriority(s.name)),
        ];

        setStems(sorted.map((s, i) => ({
          name: s.name,
          url: s.url,
          volume: 1,
          pan: 0,
          muted: false,
          solo: false,
          loading: true,
          ready: false,
          color: STEM_COLORS[i % STEM_COLORS.length],
          waveformData: null,
        })));
      } catch { toast.error("Erro ao carregar player"); router.push("/multitracks"); }
      finally { setLoading(false); }
    };
    load();
  }, [status, albumId, router]);

  // Carregar áudios e gerar waveforms (com cache local)
  useEffect(() => {
    if (stems.length === 0) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;

    stems.forEach((stem, i) => {
      if (!stem.loading) return;
      fetchWithCache(stem.url)
        .then((buf) => {
          setCachedStems((prev) => new Set(prev).add(i));
          return ctx.decodeAudioData(buf);
        })
        .then(async (decoded) => {
          buffersRef.current[i] = decoded;
          if (i === 0) setDuration(decoded.duration);
          const waveformData = await generateWaveform(decoded);
          setStems((prev) => prev.map((s, idx) =>
            idx === i ? { ...s, loading: false, ready: true, waveformData } : s
          ));
        })
        .catch(() => setStems((prev) => prev.map((s, idx) => idx === i ? { ...s, loading: false } : s)));
    });
  }, [stems.length]);

  const stopAll = useCallback(() => {
    sourceNodesRef.current.forEach((n) => { try { n.stop(); } catch {} });
    sourceNodesRef.current = [];
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const playAll = useCallback((offset = 0) => {
    const ctx = audioCtxRef.current;
    if (!ctx || buffersRef.current.length === 0) return;
    if (ctx.state === "suspended") ctx.resume();
    stopAll();

    const hasSolo = stems.some((s) => s.solo);
    stems.forEach((stem, i) => {
      const buf = buffersRef.current[i];
      if (!buf) return;
      const source = ctx.createBufferSource();
      source.buffer = buf;

      const gain = gainNodesRef.current[i] || ctx.createGain();
      gainNodesRef.current[i] = gain;
      gain.gain.value = (stem.muted || (hasSolo && !stem.solo)) ? 0 : stem.volume;

      const panner = panNodesRef.current[i] || ctx.createStereoPanner();
      panNodesRef.current[i] = panner;
      panner.pan.value = stem.pan;

      source.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
      source.start(0, offset);
      sourceNodesRef.current[i] = source;
    });

    startTimeRef.current = ctx.currentTime - offset;
    const tick = () => {
      if (!audioCtxRef.current) return;
      const t = audioCtxRef.current.currentTime - startTimeRef.current;
      setCurrentTime(Math.min(t, duration));
      if (t < duration) { animFrameRef.current = requestAnimationFrame(tick); }
      else { setIsPlaying(false); setCurrentTime(0); offsetRef.current = 0; }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [stems, duration, stopAll]);

  const jumpToMarker = useCallback((index: number) => {
    const marker = markers[index];
    if (!marker) return;
    offsetRef.current = marker.time;
    setCurrentTime(marker.time);
    if (isPlaying) { stopAll(); playAll(marker.time); }
    toast(`↩ ${marker.label}`, { duration: 1500, icon: "🎵" });
  }, [markers, isPlaying, stopAll, playAll]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignorar se estiver em input/textarea
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (isPlaying) { stopAll(); offsetRef.current = currentTime; setIsPlaying(false); }
          else { if (stems.every((s) => s.ready)) { playAll(offsetRef.current); setIsPlaying(true); } }
          break;
        case "ArrowLeft":
          e.preventDefault();
          { const t = Math.max(0, currentTime - 5); offsetRef.current = t; setCurrentTime(t); if (isPlaying) { stopAll(); playAll(t); } }
          break;
        case "ArrowRight":
          e.preventDefault();
          { const t = Math.min(duration, currentTime + 5); offsetRef.current = t; setCurrentTime(t); if (isPlaying) { stopAll(); playAll(t); } }
          break;
        case "KeyM":
          if (selectedStem !== null) updateStem(selectedStem, { muted: !stems[selectedStem]?.muted, solo: false });
          break;
        case "KeyS":
          if (selectedStem !== null) {
            const isSolo = stems[selectedStem]?.solo;
            setStems((prev) => prev.map((s, idx) => ({ ...s, solo: idx === selectedStem ? !isSolo : false, muted: false })));
          }
          break;
        default:
          // 1-9 para marcações
          if (e.code.startsWith("Digit")) {
            const n = parseInt(e.code.replace("Digit", "")) - 1;
            if (n >= 0 && n < markers.length) jumpToMarker(n);
          }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, currentTime, duration, stems, selectedStem, markers, stopAll, playAll, jumpToMarker]);

  const togglePlay = () => {
    if (isPlaying) { stopAll(); offsetRef.current = currentTime; setIsPlaying(false); }
    else {
      if (!stems.every((s) => s.ready)) { toast.error("Aguarde todos os stems carregarem"); return; }
      playAll(offsetRef.current);
      setIsPlaying(true);
    }
  };

  const handleRestart = () => { stopAll(); offsetRef.current = 0; setCurrentTime(0); setIsPlaying(false); };
  const handleSkipEnd = () => { stopAll(); offsetRef.current = duration - 2; setCurrentTime(duration - 2); setIsPlaying(false); };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    offsetRef.current = t;
    setCurrentTime(t);
    if (isPlaying) { stopAll(); playAll(t); }
  };

  // Clique no waveform
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>, stemIdx: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = ratio * duration;
    offsetRef.current = t;
    setCurrentTime(t);
    if (isPlaying) { stopAll(); playAll(t); }
  };

  // Atualizar gains e pan em tempo real
  useEffect(() => {
    const hasSolo = stems.some((s) => s.solo);
    stems.forEach((stem, i) => {
      const gain = gainNodesRef.current[i];
      if (gain) gain.gain.value = (stem.muted || (hasSolo && !stem.solo)) ? 0 : stem.volume;
      const panner = panNodesRef.current[i];
      if (panner) panner.pan.value = stem.pan;
    });
  }, [stems]);

  const updateStem = (i: number, updates: Partial<StemTrack>) =>
    setStems((prev) => prev.map((s, idx) => idx === i ? { ...s, ...updates } : s));

  const toggleMute = (i: number) => updateStem(i, { muted: !stems[i].muted, solo: false });
  const toggleSolo = (i: number) => setStems((prev) => prev.map((s, idx) => ({
    ...s, solo: idx === i ? !s.solo : false, muted: false,
  })));

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  const progress = duration > 0 ? currentTime / duration : 0;
  const allReady = stems.length > 0 && stems.every((s) => s.ready);
  const loadingCount = stems.filter((s) => s.loading).length;

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  if (loading || status === "loading") {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!album) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border flex-shrink-0">
        <button onClick={() => router.push("/multitracks")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {album.coverUrl ? (
          <img src={album.coverUrl} alt={album.title} className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-muted flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{album.title}</h1>
          <p className="text-sm text-muted-foreground truncate">{album.artist}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
          {album.musicalKey && (
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs font-mono font-semibold text-foreground">
              {album.musicalKey}
            </span>
          )}
          {album.bpm && (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-primary font-semibold">{album.bpm}</span> BPM
            </span>
          )}
          {expiresAt && (
            <span className="text-xs text-muted-foreground">{daysLeft}d restantes</span>
          )}
        </div>
      </div>

      {/* Loading indicator */}
      {!allReady && (
        <div className="flex items-center gap-2 px-5 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary flex-shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          Carregando stems... ({stems.length - loadingCount}/{stems.length})
          {cachedStems.size > 0 && (
            <span className="ml-1 text-emerald-400">· {cachedStems.size} do cache local</span>
          )}
        </div>
      )}
      {allReady && cachedStems.size === stems.length && stems.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-400 flex-shrink-0">
          ⚡ Carregado do cache local
        </div>
      )}

      {/* Stems — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {stems.map((stem, i) => (
          <div
            key={i}
            onClick={() => setSelectedStem(i)}
            className={cn(
              "flex items-center border-b border-border/50 cursor-pointer transition-colors",
              stem.muted && "opacity-40",
              stems.some((s) => s.solo) && !stem.solo && "opacity-30",
              selectedStem === i && "bg-white/5",
            )}
            style={{ borderLeft: `4px solid ${stem.color}` }}
          >
            {/* Controls */}
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 w-44">
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); toggleMute(i); }}
                  className={cn("rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    stem.muted ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}>M</button>
                <button onClick={(e) => { e.stopPropagation(); toggleSolo(i); }}
                  className={cn("rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    stem.solo ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}>S</button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: stem.color }}>{stem.name}</p>
              </div>
            </div>

            {/* Volume + Pan */}
            <div className="flex flex-col gap-0.5 px-2 flex-shrink-0 w-32" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground w-4">VOL</span>
                <input type="range" min={0} max={1} step={0.01} value={stem.volume}
                  onChange={(e) => updateStem(i, { volume: Number(e.target.value) })}
                  className="w-20 accent-primary h-1" disabled={stem.muted} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground w-4">PAN</span>
                <input type="range" min={-1} max={1} step={0.01} value={stem.pan}
                  onChange={(e) => updateStem(i, { pan: Number(e.target.value) })}
                  className="w-20 accent-violet-500 h-1" />
                <span className="text-[9px] text-muted-foreground w-5 text-right">
                  {stem.pan === 0 ? "C" : stem.pan < 0 ? `L${Math.round(Math.abs(stem.pan) * 100)}` : `R${Math.round(stem.pan * 100)}`}
                </span>
              </div>
            </div>

            {/* Waveform */}
            <div className="flex-1 cursor-pointer py-1 pr-3 relative"
              onClick={(e) => { e.stopPropagation(); handleWaveformClick(e, i); }}>
              {stem.loading ? (
                <div className="h-12 flex items-center px-2">
                  <div className="h-1 w-full rounded bg-muted animate-pulse" />
                </div>
              ) : stem.waveformData ? (
                <WaveformBar data={stem.waveformData} progress={progress} color={stem.color} />
              ) : (
                <div className="h-12 flex items-center px-2">
                  <div className="h-1 w-full rounded" style={{ backgroundColor: stem.color + "40" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Transport bar — fixo no rodapé */}
      <div className="border-t border-border bg-card px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-4">
          {/* Buttons */}
          <div className="flex items-center gap-2">
            <button onClick={handleRestart} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!allReady}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full transition-all",
                isPlaying ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90",
                !allReady && "opacity-50 cursor-not-allowed"
              )}
            >
              {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
            </button>
            <button onClick={handleSkipEnd} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          {/* Time */}
          <span className="text-xs text-muted-foreground tabular-nums w-10">{formatTime(currentTime)}</span>

          {/* Seekbar com marcações */}
          <div className="flex-1 flex flex-col gap-1">
            {/* Marcações */}
            {markers.length > 0 && (
              <div className="relative h-5">
                {markers.map((marker, i) => (
                  <button
                    key={i}
                    onClick={() => jumpToMarker(i)}
                    title={`${i + 1}: ${marker.label} (${formatTime(marker.time)})`}
                    className="absolute -translate-x-1/2 flex flex-col items-center group"
                    style={{ left: `${(marker.time / duration) * 100}%` }}
                  >
                    <span
                      className="text-[9px] font-semibold px-1 py-0.5 rounded whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: marker.color + "33", color: marker.color, border: `1px solid ${marker.color}55` }}
                    >
                      {i + 1}. {marker.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {/* Seekbar */}
            <div className="relative h-2 cursor-pointer" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - rect.left) / rect.width) * duration;
              offsetRef.current = t; setCurrentTime(t);
              if (isPlaying) { stopAll(); playAll(t); }
            }}>
              <div className="absolute inset-0 rounded-full bg-muted" />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
              {/* Pins das marcações na seekbar */}
              {markers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-0.5 opacity-70"
                  style={{ left: `${(marker.time / duration) * 100}%`, backgroundColor: marker.color }}
                />
              ))}
              <input
                type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{formatTime(duration)}</span>

          {/* BPM badge */}
          {album.bpm && (
            <span className="hidden sm:flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs font-mono">
              <span className="text-primary font-bold">{album.bpm}</span>
              <span className="text-muted-foreground">BPM</span>
            </span>
          )}
        </div>

        {/* Atalhos de teclado */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/50">
          <span><kbd className="rounded bg-muted px-1">Espaço</kbd> play/pause</span>
          <span><kbd className="rounded bg-muted px-1">←</kbd><kbd className="rounded bg-muted px-1">→</kbd> ±5s</span>
          <span><kbd className="rounded bg-muted px-1">M</kbd> mute</span>
          <span><kbd className="rounded bg-muted px-1">S</kbd> solo</span>
          {markers.length > 0 && <span><kbd className="rounded bg-muted px-1">1-9</kbd> marcações</span>}
          {selectedStem !== null && (
            <span className="text-primary/60">Canal selecionado: <span style={{ color: stems[selectedStem]?.color }}>{stems[selectedStem]?.name}</span></span>
          )}
        </div>
      </div>
    </div>
  );
}
