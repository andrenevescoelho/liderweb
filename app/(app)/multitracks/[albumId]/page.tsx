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
  muted: boolean;
  solo: boolean;
  loading: boolean;
  ready: boolean;
  color: string;
  waveformData: number[] | null;
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
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cachedStems, setCachedStems] = useState<Set<number>>(new Set());

  useEffect(() => { pruneExpiredCache(); }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
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

        // Ordenar: prioridade (Click, Guia) primeiro
        const rawStems = data.stems as { name: string; url: string }[];
        const sorted = [
          ...rawStems.filter((s) => isPriority(s.name)),
          ...rawStems.filter((s) => !isPriority(s.name)),
        ];

        setStems(sorted.map((s, i) => ({
          name: s.name,
          url: s.url,
          volume: 1,
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
      source.connect(gain);
      gain.connect(ctx.destination);
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

  // Atualizar gains em tempo real
  useEffect(() => {
    const hasSolo = stems.some((s) => s.solo);
    stems.forEach((stem, i) => {
      const gain = gainNodesRef.current[i];
      if (!gain) return;
      gain.gain.value = (stem.muted || (hasSolo && !stem.solo)) ? 0 : stem.volume;
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
            className={cn(
              "flex items-center border-b border-border/50 group",
              stem.muted && "opacity-40",
              stems.some((s) => s.solo) && !stem.solo && "opacity-30",
            )}
            style={{ borderLeft: `4px solid ${stem.color}` }}
          >
            {/* Controls */}
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 w-48">
              <div className="flex gap-1">
                <button
                  onClick={() => toggleMute(i)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    stem.muted ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >M</button>
                <button
                  onClick={() => toggleSolo(i)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    stem.solo ? "bg-amber-500 text-black" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >S</button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: stem.color }}>{stem.name}</p>
              </div>
            </div>

            {/* Volume fader */}
            <div className="flex items-center gap-1 px-2 flex-shrink-0 w-28">
              <Volume2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <input
                type="range" min={0} max={1} step={0.01} value={stem.volume}
                onChange={(e) => updateStem(i, { volume: Number(e.target.value) })}
                className="w-16 accent-primary"
                disabled={stem.muted}
              />
            </div>

            {/* Waveform */}
            <div
              className="flex-1 cursor-pointer py-1 pr-3"
              onClick={(e) => handleWaveformClick(e, i)}
            >
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

          {/* Seekbar */}
          <div className="flex-1 relative h-2 group cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = ((e.clientX - rect.left) / rect.width) * duration;
            offsetRef.current = t; setCurrentTime(t);
            if (isPlaying) { stopAll(); playAll(t); }
          }}>
            <div className="absolute inset-0 rounded-full bg-muted" />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
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
      </div>
    </div>
  );
}
