"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Loader2, ArrowLeft, Play, Pause, SkipBack, Volume2, Timer, MapPin, Mic2, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface SplitStem { id: string; label: string; displayName: string; type: string; }
interface SplitJob {
  id: string; songName: string; artistName: string | null;
  bpm: number | null; musicalKey: string | null; sections: any[] | null;
  durationSec: number | null; stems: SplitStem[];
}

interface Track {
  stemId: string; name: string; color: string; type: string;
  volume: number; pan: number; muted: boolean; solo: boolean;
  loading: boolean; ready: boolean; waveformData: number[] | null;
}

const STEM_COLORS: Record<string, string> = {
  guide: "#8B5CF6", metronome: "#F59E0B",
  "vocals@0": "#EF4444", "vocals@1": "#F87171", vocals: "#EF4444",
  drum: "#F59E0B", bass: "#84CC16", piano: "#06B6D4",
  electric_guitar: "#10B981", acoustic_guitar: "#34D399",
  synthesizer: "#A78BFA", strings: "#EC4899", wind: "#38BDF8",
  no_vocals: "#6366F1",
};
const FALLBACK_COLORS = ["#8B5CF6","#EF4444","#F59E0B","#10B981","#06B6D4","#EC4899","#84CC16","#A78BFA"];

async function generateWaveform(buffer: AudioBuffer, samples = 200): Promise<number[]> {
  const raw = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(raw.length / samples));
  const waveform: number[] = [];
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[Math.min(start + j, raw.length - 1)]);
    waveform.push(sum / blockSize);
  }
  const max = Math.max(...waveform, 0.001);
  return waveform.map(v => v / max);
}

const WaveformBar = memo(function WaveformBar({ data, progress, color }: { data: number[]; progress: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useCallback((prog: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    const barW = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const barH = Math.max(1, data[i] * h * 0.88);
      ctx.fillStyle = (i / data.length) < prog ? color : color + "55";
      ctx.beginPath();
      ctx.rect(i * barW + barW * 0.1, (h - barH) / 2, barW * 0.8, barH);
      ctx.fill();
    }
  }, [data, color]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
    draw(progress);
  }, [data, color, draw, progress]);
  useEffect(() => { draw(progress); }, [progress, draw]);
  return <canvas ref={canvasRef} className="w-full h-12" style={{ display: "block" }} />;
});

function formatTime(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SplitPlayerPage() {
  const { data: session, status } = useSession() || {};
  const user = session?.user as SessionUser | undefined;
  const router = useRouter();
  const params = useParams();
  const jobId = params?.jobId as string;

  const [job, setJob] = useState<SplitJob | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<(AudioBuffer | null)[]>([]);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserNodesRef = useRef<AnalyserNode[]>([]);
  const vuRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animRef = useRef<number>(0);
  const vuAnimRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

  // Carregar job
  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (!jobId || status !== "authenticated") return;
    const load = async () => {
      const res = await fetch(`/api/splits?id=${jobId}`);
      const data = await res.json();
      if (!res.ok || !data.job) { toast.error("Split não encontrado"); router.back(); return; }
      setJob(data.job);
      // Inicializar tracks na ordem: guide, metronome, vocals, drums, bass, etc.
      const ordered = [...data.job.stems].sort((a: SplitStem, b: SplitStem) => {
        const order: Record<string, number> = { guide: 0, metronome: 1, "vocals@0": 2, "vocals@1": 3, vocals: 4, drum: 5, bass: 6, piano: 7, electric_guitar: 8, acoustic_guitar: 9, synthesizer: 10, strings: 11, wind: 12, no_vocals: 13 };
        return (order[a.label] ?? 99) - (order[b.label] ?? 99);
      });
      setTracks(ordered.map((s: SplitStem, i: number) => ({
        stemId: s.id, name: s.displayName, type: s.type,
        color: STEM_COLORS[s.label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        volume: 1, pan: 0, muted: false, solo: false,
        loading: true, ready: false, waveformData: null,
      })));
      setLoading(false);
    };
    load();
  }, [jobId, status, router]);

  // Carregar áudios
  useEffect(() => {
    if (tracks.length === 0 || !tracks[0].loading) return;
    const ctx = audioCtxRef.current ?? new AudioContext();
    if (!audioCtxRef.current) audioCtxRef.current = ctx;

    const loadAll = async () => {
      const promises = tracks.map(async (track, i) => {
        try {
          const res = await fetch(`/api/splits/audio?stemId=${track.stemId}`);
          const { url } = await res.json();
          const buf = await (await fetch(url)).arrayBuffer();
          const decoded = await ctx.decodeAudioData(buf);
          buffersRef.current[i] = decoded;
          setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, loading: false, ready: true } : t));
          return decoded;
        } catch (err) {
          console.warn(`[split-player] stem ${i} falhou:`, err);
          setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, loading: false, ready: true } : t));
          return null;
        }
      });
      const decoded = await Promise.all(promises);
      const maxDuration = Math.max(...decoded.map(d => d?.duration || 0), 0.001);
      setDuration(maxDuration);
      await Promise.all(decoded.map(async (d, i) => {
        if (!d) return;
        const waveformData = await generateWaveform(d, 200);
        setTracks(prev => prev.map((t, idx) => idx === i ? { ...t, waveformData } : t));
      }));
    };
    loadAll();
  }, [tracks.length]);

  const stopAll = useCallback(() => {
    sourceNodesRef.current.forEach(n => { try { n.stop(); } catch {} });
    sourceNodesRef.current = [];
    cancelAnimationFrame(animRef.current);
    cancelAnimationFrame(vuAnimRef.current);
  }, []);

  const playAll = useCallback(async (offset = 0) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    stopAll();

    masterGainRef.current = ctx.createGain();
    masterGainRef.current.gain.value = masterVolume;
    masterGainRef.current.connect(ctx.destination);

    const currentTracks = tracks;
    const hasSolo = currentTracks.some(t => t.solo);

    sourceNodesRef.current = [];
    gainNodesRef.current = [];
    panNodesRef.current = [];
    analyserNodesRef.current = [];

    currentTracks.forEach((track, i) => {
      const buf = buffersRef.current[i];
      if (!buf) return;

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const gain = ctx.createGain();
      const isMuted = track.muted || (hasSolo && !track.solo);
      gain.gain.value = isMuted ? 0 : track.volume;

      const pan = ctx.createStereoPanner();
      pan.pan.value = track.pan;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;

      src.connect(gain);
      gain.connect(pan);
      pan.connect(analyser);
      analyser.connect(masterGainRef.current!);

      sourceNodesRef.current[i] = src;
      gainNodesRef.current[i] = gain;
      panNodesRef.current[i] = pan;
      analyserNodesRef.current[i] = analyser;
    });

    // Iniciar TODOS no mesmo instante para garantir sincronização
    const startAt = ctx.currentTime + 0.05; // pequeno buffer para garantir sync
    sourceNodesRef.current.forEach((src, i) => {
      if (src) src.start(startAt, offset);
    });
    startTimeRef.current = startAt - offset;
    setPlaying(true);

    // Animação de progresso
    const tick = () => {
      const t = ctx.currentTime - startTimeRef.current;
      setCurrentTime(t);
      if (t >= duration) { setPlaying(false); setCurrentTime(0); return; }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    // VU meters
    const dataArr = new Uint8Array(32);
    const vuTick = () => {
      analyserNodesRef.current.forEach((an, i) => {
        if (!an) return;
        an.getByteTimeDomainData(dataArr);
        let sum = 0;
        for (let k = 0; k < dataArr.length; k++) { const v = (dataArr[k] - 128) / 128; sum += v * v; }
        const level = Math.min(1, Math.sqrt(sum / dataArr.length) * 4);
        const el = vuRefs.current[i];
        if (el) {
          el.style.width = `${level * 100}%`;
          el.style.backgroundColor = level > 0.8 ? "#ef4444" : level > 0.5 ? "#f59e0b" : tracks[i]?.color ?? "#8b5cf6";
        }
      });
      vuAnimRef.current = requestAnimationFrame(vuTick);
    };
    vuAnimRef.current = requestAnimationFrame(vuTick);
  }, [tracks, duration, masterVolume, stopAll]);

  const handlePlayPause = async () => {
    if (playing) {
      offsetRef.current = audioCtxRef.current ? audioCtxRef.current.currentTime - startTimeRef.current : offsetRef.current;
      stopAll();
      setPlaying(false);
    } else {
      await playAll(offsetRef.current);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = ratio * duration;
    offsetRef.current = t;
    setCurrentTime(t);
    if (playing) playAll(t);
  };

  const updateTrack = (i: number, u: Partial<Track>) => {
    setTracks(prev => {
      const next = prev.map((t, idx) => idx === i ? { ...t, ...u } : t);
      const hasSolo = next.some(t => t.solo);
      // Atualizar TODOS os gains quando solo muda (afeta todas as faixas)
      next.forEach((t, idx) => {
        const gain = gainNodesRef.current[idx];
        const pan = panNodesRef.current[idx];
        if (gain) {
          const shouldMute = t.muted || (hasSolo && !t.solo);
          gain.gain.value = shouldMute ? 0 : t.volume;
        }
        if (idx === i && pan && u.pan !== undefined) pan.pan.value = u.pan;
      });
      return next;
    });
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (!job) return null;

  const allLoaded = tracks.every(t => t.ready);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50 flex-shrink-0">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{job.songName}</p>
          {job.artistName && <p className="text-xs text-muted-foreground">{job.artistName}</p>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {job.bpm && <span className="font-mono">{Math.round(job.bpm)} BPM</span>}
          {job.musicalKey && <span>{job.musicalKey}</span>}
        </div>
      </div>

      {/* Seções */}
      {job.sections && job.sections.length > 0 && (
        <div className="flex gap-1.5 px-4 py-2 border-b border-border/30 flex-shrink-0 overflow-x-auto">
          {job.sections.map((s: any, i: number) => (
            <button key={i}
              onClick={() => { const t = s.startSec; offsetRef.current = t; setCurrentTime(t); if (playing) playAll(t); }}
              className="flex-shrink-0 text-[10px] rounded-full bg-muted/30 border border-border/50 px-2.5 py-0.5 hover:border-primary/40 hover:text-primary transition-colors">
              {s.label} {formatTime(s.startSec)}
            </button>
          ))}
        </div>
      )}

      {/* Faixas */}
      <div className="flex-1 overflow-y-auto">
        {tracks.map((track, i) => (
          <div key={track.stemId}
            className={cn("flex items-center border-b border-border/30 transition-colors",
              track.muted && "opacity-40",
              tracks.some(t => t.solo) && !track.solo && "opacity-30"
            )}
            style={{ borderLeft: `3px solid ${track.color}` }}>
            {/* Controles */}
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 w-44">
              <div className="flex gap-1">
                <button onClick={() => updateTrack(i, { muted: !track.muted })}
                  className={cn("rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    track.muted ? "bg-red-500 text-white" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>M</button>
                <button onClick={() => updateTrack(i, { solo: !track.solo })}
                  className={cn("rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                    track.solo ? "bg-amber-500 text-black" : "bg-muted/50 text-muted-foreground hover:text-foreground")}>S</button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: track.color }}>{track.name}</p>
                <p className="text-[9px] text-muted-foreground capitalize">{track.type}</p>
              </div>
            </div>

            {/* Volume + VU */}
            <div className="flex items-center gap-2 px-2 flex-shrink-0 w-36">
              <div className="flex flex-col gap-0.5 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-5">VOL</span>
                  <input type="range" min={0} max={1} step={0.01} value={track.volume}
                    onChange={e => updateTrack(i, { volume: Number(e.target.value) })}
                    className="w-14 accent-primary h-1" disabled={track.muted} />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-5">VU</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div ref={el => { vuRefs.current[i] = el; }}
                      className="h-full rounded-full transition-none"
                      style={{ width: "0%", backgroundColor: track.color }} />
                  </div>
                </div>
              </div>
              {/* Pan */}
              <div className="flex flex-col items-center gap-0.5">
                <input type="range" min={-1} max={1} step={0.01} value={track.pan}
                  onChange={e => updateTrack(i, { pan: Number(e.target.value) })}
                  className="w-12 accent-primary h-1" style={{ writingMode: "horizontal-tb" }} />
                <span className="text-[8px] text-muted-foreground">
                  {track.pan === 0 ? "C" : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : `R${Math.round(track.pan * 100)}`}
                </span>
              </div>
            </div>

            {/* Waveform */}
            <div className="flex-1 relative h-14 cursor-pointer overflow-hidden"
              onClick={handleSeek}>
              {track.loading ? (
                <div className="h-full flex items-center px-2">
                  <div className="h-1 w-full rounded bg-muted/30 animate-pulse" />
                </div>
              ) : track.waveformData ? (
                <WaveformBar data={track.waveformData} progress={progress} color={track.color} />
              ) : (
                <div className="h-full flex items-center px-2">
                  <div className="h-1 w-full rounded" style={{ backgroundColor: track.color + "40" }} />
                </div>
              )}
              {/* Playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none z-10"
                style={{ left: `${progress * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Transport */}
      <div className="border-t border-border bg-card px-4 py-3 flex-shrink-0">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground font-mono w-10 text-right">{formatTime(currentTime)}</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted/30 cursor-pointer relative overflow-hidden" onClick={handleSeek}>
            <div className="h-full rounded-full bg-primary transition-none" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground font-mono w-10">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => { offsetRef.current = 0; setCurrentTime(0); if (playing) playAll(0); }}
              className="h-8 w-8 rounded-full bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors">
              <SkipBack className="h-4 w-4" />
            </button>
            <button onClick={handlePlayPause} disabled={!allLoaded}
              className={cn("h-12 w-12 rounded-full flex items-center justify-center transition-colors",
                allLoaded ? "bg-primary hover:bg-primary/90" : "bg-muted/30 cursor-not-allowed")}>
              {!allLoaded ? <Loader2 className="h-5 w-5 animate-spin" /> :
                playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
          </div>

          {/* Master volume */}
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <input type="range" min={0} max={1} step={0.01} value={masterVolume}
              onChange={e => {
                const v = Number(e.target.value);
                setMasterVolume(v);
                if (masterGainRef.current) masterGainRef.current.gain.value = v;
              }}
              className="w-20 accent-primary h-1" />
            <span className="text-xs text-muted-foreground w-8">{Math.round(masterVolume * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
