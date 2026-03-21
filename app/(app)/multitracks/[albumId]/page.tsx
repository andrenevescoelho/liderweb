"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Play, Pause, SkipBack, Volume2, VolumeX, Loader2, ArrowLeft, Music2, Clock,
} from "lucide-react";
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
}

interface AlbumInfo {
  id: string;
  title: string;
  artist: string;
  bpm: number | null;
  musicalKey: string | null;
  coverUrl: string | null;
}

const STEM_COLORS = [
  "bg-teal-500", "bg-violet-500", "bg-amber-500", "bg-rose-500",
  "bg-blue-500", "bg-emerald-500", "bg-orange-500", "bg-pink-500",
];

export default function MultitracksPlayerPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const params = useParams();
  const albumId = params?.albumId as string;
  const user = session?.user as SessionUser | undefined;

  const [album, setAlbum] = useState<AlbumInfo | null>(null);
  const [stems, setStems] = useState<StemTrack[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

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
        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error || "Erro ao carregar player");
          router.push("/multitracks");
          return;
        }
        const data = await res.json();
        setAlbum(data.album);
        setExpiresAt(data.expiresAt);
        setStems(data.stems.map((s: { name: string; url: string }) => ({
          name: s.name,
          url: s.url,
          volume: 1,
          muted: false,
          solo: false,
          loading: true,
          ready: false,
        })));
      } catch {
        toast.error("Erro ao carregar player");
        router.push("/multitracks");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [status, albumId, router]);

  // Carregar áudios
  useEffect(() => {
    if (stems.length === 0) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    stems.forEach((stem, i) => {
      if (!stem.loading) return;
      fetch(stem.url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => {
          buffersRef.current[i] = decoded;
          if (i === 0) setDuration(decoded.duration);
          setStems((prev) => prev.map((s, idx) => idx === i ? { ...s, loading: false, ready: true } : s));
        })
        .catch(() => {
          setStems((prev) => prev.map((s, idx) => idx === i ? { ...s, loading: false } : s));
        });
    });
  }, [stems.length]);

  const stopAll = useCallback(() => {
    sourceNodesRef.current.forEach((node) => { try { node.stop(); } catch {} });
    sourceNodesRef.current = [];
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const playAll = useCallback((offset = 0) => {
    const ctx = audioCtxRef.current;
    if (!ctx || buffersRef.current.length === 0) return;
    if (ctx.state === "suspended") ctx.resume();

    stopAll();

    const hasSolo = stems.some((s) => s.solo);
    const newSources: AudioBufferSourceNode[] = [];

    stems.forEach((stem, i) => {
      const buf = buffersRef.current[i];
      if (!buf) return;

      const source = ctx.createBufferSource();
      source.buffer = buf;

      const gain = gainNodesRef.current[i] || ctx.createGain();
      gainNodesRef.current[i] = gain;

      const effectiveMute = stem.muted || (hasSolo && !stem.solo);
      gain.gain.value = effectiveMute ? 0 : stem.volume;

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0, offset);
      newSources.push(source);
    });

    sourceNodesRef.current = newSources;
    startTimeRef.current = ctx.currentTime - offset;
    offsetRef.current = offset;

    const tick = () => {
      if (!audioCtxRef.current) return;
      const t = audioCtxRef.current.currentTime - startTimeRef.current;
      setCurrentTime(Math.min(t, duration));
      if (t < duration) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
        offsetRef.current = 0;
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [stems, duration, stopAll]);

  const togglePlay = () => {
    if (isPlaying) {
      stopAll();
      offsetRef.current = currentTime;
      setIsPlaying(false);
    } else {
      const allReady = stems.every((s) => s.ready);
      if (!allReady) { toast.error("Aguarde todos os stems carregarem"); return; }
      playAll(offsetRef.current);
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    stopAll();
    offsetRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    offsetRef.current = t;
    setCurrentTime(t);
    if (isPlaying) {
      stopAll();
      playAll(t);
    }
  };

  // Atualizar volume em tempo real
  useEffect(() => {
    if (!isPlaying) return;
    const hasSolo = stems.some((s) => s.solo);
    stems.forEach((stem, i) => {
      const gain = gainNodesRef.current[i];
      if (!gain) return;
      const effectiveMute = stem.muted || (hasSolo && !stem.solo);
      gain.gain.value = effectiveMute ? 0 : stem.volume;
    });
  }, [stems, isPlaying]);

  const updateStem = (i: number, updates: Partial<StemTrack>) => {
    setStems((prev) => prev.map((s, idx) => idx === i ? { ...s, ...updates } : s));
  };

  const toggleMute = (i: number) => updateStem(i, { muted: !stems[i].muted, solo: false });

  const toggleSolo = (i: number) => {
    const isSolo = stems[i].solo;
    setStems((prev) => prev.map((s, idx) => ({
      ...s,
      solo: idx === i ? !isSolo : false,
      muted: false,
    })));
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (loading || status === "loading") {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!album) return null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back */}
      <button onClick={() => router.push("/multitracks")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Voltar ao catálogo
      </button>

      {/* Album info */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden bg-muted">
          {album.coverUrl ? (
            <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{album.title}</h1>
          <p className="text-muted-foreground">{album.artist}</p>
          <div className="flex gap-2 mt-1">
            {album.bpm && <span className="text-xs text-muted-foreground">{album.bpm} BPM</span>}
            {album.musicalKey && <span className="text-xs text-muted-foreground">Tom {album.musicalKey}</span>}
            {expiresAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />{daysLeft}d restantes
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={handleRestart} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={stems.some((s) => s.loading)}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full transition-all",
              isPlaying ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"
            )}
          >
            {stems.some((s) => s.loading) ? (
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5 text-white" />
            ) : (
              <Play className="h-5 w-5 text-white ml-0.5" />
            )}
          </button>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums w-10">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Stems mixer */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mixer de Stems</h2>
        {stems.map((stem, i) => (
          <div key={i} className={cn(
            "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all",
            stem.solo && "border-primary/40 bg-primary/5",
            stem.muted && "opacity-50"
          )}>
            {/* Color indicator */}
            <div className={cn("h-8 w-1.5 rounded-full flex-shrink-0", STEM_COLORS[i % STEM_COLORS.length])} />

            {/* Name */}
            <div className="w-24 flex-shrink-0">
              <p className="text-sm font-medium truncate">{stem.name}</p>
              {stem.loading && <p className="text-[10px] text-muted-foreground">Carregando...</p>}
            </div>

            {/* Fader */}
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stem.volume}
                onChange={(e) => updateStem(i, { volume: Number(e.target.value) })}
                className="flex-1 accent-primary"
                disabled={stem.muted}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {Math.round(stem.volume * 100)}
              </span>
            </div>

            {/* Controls */}
            <div className="flex gap-1">
              <button
                onClick={() => toggleMute(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  stem.muted
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                M
              </button>
              <button
                onClick={() => toggleSolo(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  stem.solo
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                S
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
