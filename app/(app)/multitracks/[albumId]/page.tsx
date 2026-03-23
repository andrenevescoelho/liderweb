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

function PanKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  // Ângulo: -135° (L) a +135° (R), 0 = centro
  const angle = value * 135;
  const rad = (angle - 90) * (Math.PI / 180);
  const cx = 16, cy = 16, r = 10;
  const dotX = cx + r * 0.7 * Math.cos(rad);
  const dotY = cy + r * 0.7 * Math.sin(rad);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = (startY.current - ev.clientY) / 80;
      const next = Math.max(-1, Math.min(1, startVal.current + delta));
      onChange(Math.round(next * 100) / 100);
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDblClick = (e: React.MouseEvent) => { e.stopPropagation(); onChange(0); };

  const label = value === 0 ? "C" : value < 0 ? `L${Math.round(Math.abs(value) * 100)}` : `R${Math.round(value * 100)}`;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" title="Pan — arraste para ajustar, duplo clique para centralizar">
      <svg ref={ref} width={32} height={32} viewBox="0 0 32 32"
        onMouseDown={onMouseDown} onDoubleClick={onDblClick}
        className="cursor-ns-resize"
      >
        {/* Track arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3} />
        {/* Active arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={value === 0 ? "rgba(255,255,255,0.3)" : value < 0 ? "#06B6D4" : "#8B5CF6"}
          strokeWidth={3}
          strokeDasharray={`${Math.abs(value) * 21} 63`}
          strokeDashoffset={value < 0 ? 16 : 16 - Math.abs(value) * 21}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Knob body */}
        <circle cx={cx} cy={cy} r={8} fill="#1e2535" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        {/* Indicator dot */}
        <circle cx={dotX} cy={dotY} r={2} fill={value === 0 ? "rgba(255,255,255,0.6)" : value < 0 ? "#06B6D4" : "#8B5CF6"} />
      </svg>
      <span className="text-[8px] text-muted-foreground tabular-nums">{label}</span>
    </div>
  );
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
  const [scheduledJump, setScheduledJump] = useState<{ markerIndex: number; label: string; color: string } | null>(null);
  const scheduledJumpRef = useRef<{ markerIndex: number; sectionEndTime: number } | null>(null);
  const waveformAreaRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [editingMarker, setEditingMarker] = useState<number | null>(null);
  const [editingMarkerTime, setEditingMarkerTime] = useState<string>("");
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [shortcuts, setShortcuts] = useState<Record<number, string>>({});
  const [recordingShortcut, setRecordingShortcut] = useState<number | null>(null);
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [draggingMarker, setDraggingMarker] = useState<number | null>(null);
  const [showBpmGrid, setShowBpmGrid] = useState(false);
  const [addingMarker, setAddingMarker] = useState(false);
  const [bpmOffset, setBpmOffset] = useState(0);
  const [showMixer, setShowMixer] = useState(false); // segundos de offset do 1º tempo
  const rulerRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<Record<number, string>>({});
  const userIdRef = useRef<string>("");

  // Carregar atalhos do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`marker-shortcuts-${albumId}`);
      if (saved) { const p = JSON.parse(saved); setShortcuts(p); shortcutsRef.current = p; }
    } catch {}
  }, [albumId]);

  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);

  const saveShortcuts = useCallback((newShortcuts: Record<number, string>) => {
    setShortcuts(newShortcuts);
    shortcutsRef.current = newShortcuts;
    try { localStorage.setItem(`marker-shortcuts-${albumId}`, JSON.stringify(newShortcuts)); } catch {}
  }, [albumId]);

  // Salvar configs de stems por usuário
  const saveStemConfigs = useCallback((newStems: StemTrack[]) => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const configs = newStems.map((s) => ({ volume: s.volume, pan: s.pan, muted: s.muted }));
      localStorage.setItem(`stem-configs-${userId}-${albumId}`, JSON.stringify(configs));
    } catch {}
  }, [albumId]);

  const updateStemAndSave = useCallback((i: number, updates: Partial<StemTrack>) => {
    setStems((prev) => {
      const next = prev.map((s, idx) => idx === i ? { ...s, ...updates } : s);
      saveStemConfigs(next);
      return next;
    });
  }, [saveStemConfigs]);

  const saveMarkers = useCallback(async (newMarkers: Marker[]) => {
    try {
      await fetch(`/api/multitracks/${albumId}/analyze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markers: newMarkers }),
      });
    } catch { /* silent */ }
  }, [albumId]);

  useEffect(() => { pruneExpiredCache(); }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  const panNodesRef = useRef<StereoPannerNode[]>([]);
  const analyserNodesRef = useRef<AnalyserNode[]>([]);
  const buffersRef = useRef<AudioBuffer[]>([]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const levelAnimRef = useRef<number>(0);
  const markersRef = useRef<Marker[]>([]);
  const stemsRef = useRef<StemTrack[]>([]);
  const [stemLevels, setStemLevels] = useState<number[]>([]);

  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { stemsRef.current = stems; }, [stems]);

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

        // Carregar configs salvas do usuário
        const userId = (session?.user as any)?.id || "";
        userIdRef.current = userId;
        let savedConfigs: { volume: number; pan: number; muted: boolean }[] = [];
        try {
          const raw = localStorage.getItem(`stem-configs-${userId}-${albumId}`);
          if (raw) savedConfigs = JSON.parse(raw);
        } catch {}

        setStems(sorted.map((s, i) => ({
          name: s.name,
          url: s.url,
          volume: savedConfigs[i]?.volume ?? 1,
          pan: savedConfigs[i]?.pan ?? 0,
          muted: savedConfigs[i]?.muted ?? false,
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
        .catch((err) => {
          console.warn(`[multitracks] Stem ${i} (${stem.name}) falhou:`, err);
          // Marca como ready=true mesmo com erro para não travar o allReady
          setStems((prev) => prev.map((s, idx) =>
            idx === i ? { ...s, loading: false, ready: true } : s
          ));
        });
    });
  }, [stems.length]);

  const stopAll = useCallback(() => {
    sourceNodesRef.current.forEach((n) => { try { n.stop(); } catch {} });
    sourceNodesRef.current = [];
    cancelAnimationFrame(animFrameRef.current);
    cancelAnimationFrame(levelAnimRef.current);
    setStemLevels([]);
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

      // Analyser para VU meter
      const analyser = analyserNodesRef.current[i] || ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserNodesRef.current[i] = analyser;

      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(panner);
      panner.connect(ctx.destination);
      source.start(0, offset);
      sourceNodesRef.current[i] = source;
    });

    // Loop de leitura de níveis
    const dataArray = new Uint8Array(32);
    const readLevels = () => {
      const levels = analyserNodesRef.current.map((analyser, i) => {
        if (!analyser) return 0;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let k = 0; k < dataArray.length; k++) {
          const v = (dataArray[k] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const s = stemsRef.current[i];
        return (s?.muted) ? 0 : rms * 4;
      });
      setStemLevels(levels);
      levelAnimRef.current = requestAnimationFrame(readLevels);
    };
    levelAnimRef.current = requestAnimationFrame(readLevels);

    startTimeRef.current = ctx.currentTime - offset;
    const tick = () => {
      if (!audioCtxRef.current) return;
      const t = audioCtxRef.current.currentTime - startTimeRef.current;
      const clipped = Math.min(t, duration);
      setCurrentTime(clipped);

      // Verificar scheduled jump
      if (scheduledJumpRef.current && t >= scheduledJumpRef.current.sectionEndTime) {
        const targetIdx = scheduledJumpRef.current.markerIndex;
        scheduledJumpRef.current = null;
        setScheduledJump(null);
        const targetTime = markersRef.current[targetIdx]?.time ?? 0;
        offsetRef.current = targetTime;
        // Reagendar próximo tick com novo offset
        if (audioCtxRef.current) {
          startTimeRef.current = audioCtxRef.current.currentTime - targetTime;
          // Reiniciar sources
          sourceNodesRef.current.forEach((n) => { try { n.stop(); } catch {} });
          sourceNodesRef.current = [];
          const hasSolo = stemsRef.current.some((s: StemTrack) => s.solo);
          stemsRef.current.forEach((stem: StemTrack, i: number) => {
            const buf = buffersRef.current[i];
            if (!buf || !audioCtxRef.current) return;
            const source = audioCtxRef.current.createBufferSource();
            source.buffer = buf;
            const gain = gainNodesRef.current[i] || audioCtxRef.current.createGain();
            gainNodesRef.current[i] = gain;
            gain.gain.value = (stem.muted || (hasSolo && !stem.solo)) ? 0 : stem.volume;
            const panner = panNodesRef.current[i] || audioCtxRef.current.createStereoPanner();
            panNodesRef.current[i] = panner;
            panner.pan.value = stem.pan;
            source.connect(gain);
            gain.connect(panner);
            panner.connect(audioCtxRef.current.destination);
            source.start(0, targetTime);
            sourceNodesRef.current[i] = source;
          });
        }
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      if (t < duration) { animFrameRef.current = requestAnimationFrame(tick); }
      else { setIsPlaying(false); setCurrentTime(0); offsetRef.current = 0; scheduledJumpRef.current = null; setScheduledJump(null); }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [stems, duration, stopAll]);

  // Calcula quando a seção atual termina (início da próxima seção)
  const getCurrentSectionEnd = useCallback((t: number): number => {
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    const nextSection = sorted.find((m) => m.time > t + 0.5);
    return nextSection ? nextSection.time : duration;
  }, [markers, duration]);

  const jumpToMarker = useCallback((index: number) => {
    const marker = markers[index];
    if (!marker) return;

    // Se já tem um jump agendado para o mesmo marker, cancela
    if (scheduledJumpRef.current?.markerIndex === index) {
      scheduledJumpRef.current = null;
      setScheduledJump(null);
      toast("Repetição cancelada", { duration: 1200, icon: "✕" });
      return;
    }

    // Se estiver tocando, agenda para o fim da seção atual
    if (isPlaying) {
      const sectionEnd = getCurrentSectionEnd(offsetRef.current);
      scheduledJumpRef.current = { markerIndex: index, sectionEndTime: sectionEnd };
      setScheduledJump({ markerIndex: index, label: marker.label, color: marker.color });
      toast(`⏭ Vai repetir "${marker.label}" ao fim desta seção`, { duration: 2000, icon: "🔁" });
    } else {
      // Se pausado, pula direto
      offsetRef.current = marker.time;
      setCurrentTime(marker.time);
      toast(`↩ ${marker.label}`, { duration: 1500, icon: "🎵" });
    }
  }, [markers, isPlaying, getCurrentSectionEnd]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Modo de gravação de atalho
      if (recordingShortcut !== null) {
        e.preventDefault();
        if (e.code === "Escape") { setRecordingShortcut(null); return; }
        const key = e.key.toUpperCase();
        // Remover qualquer atalho existente para essa tecla
        const cleaned = Object.fromEntries(
          Object.entries(shortcutsRef.current).filter(([, v]) => v !== key)
        );
        const newShortcuts = { ...cleaned, [recordingShortcut]: key };
        saveShortcuts(newShortcuts);
        setRecordingShortcut(null);
        toast(`Atalho "${key}" atribuído a "${markersRef.current[recordingShortcut]?.label}"`, { duration: 2000, icon: "⌨️" });
        return;
      }

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
        case "Equal": case "NumpadAdd":
          e.preventDefault();
          setZoom((z) => Math.min(8, z * 1.5));
          break;
        case "Minus": case "NumpadSubtract":
          e.preventDefault();
          setZoom((z) => Math.max(1, z / 1.5));
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
        case "KeyX":
          e.preventDefault();
          setShowMixer(v => !v);
          break;
        case "Escape":
          if (scheduledJumpRef.current) {
            scheduledJumpRef.current = null;
            setScheduledJump(null);
            toast("Repetição cancelada", { duration: 1200 });
          }
          break;
        default:
          // Verificar atalhos customizados primeiro
          const pressedKey = e.key.toUpperCase();
          const customIdx = Object.entries(shortcutsRef.current).find(([, k]) => k === pressedKey)?.[0];
          if (customIdx !== undefined) {
            e.preventDefault();
            jumpToMarker(parseInt(customIdx));
            break;
          }
          // 1-9 fallback para markers sem atalho customizado
          if (e.code.startsWith("Digit")) {
            e.preventDefault();
            const n = parseInt(e.code.replace("Digit", "")) - 1;
            if (n >= 0 && n < markers.length) jumpToMarker(n);
          }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, currentTime, duration, stems, selectedStem, markers, stopAll, playAll, jumpToMarker, recordingShortcut, saveShortcuts]);

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

  // Calcula o tempo real considerando zoom e scroll
  const getTimeFromClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    // Compensar zoom e scroll
    const scrollOffset = scrollLeft * (zoom - 1) / zoom;
    return Math.max(0, Math.min(duration, (ratio / zoom + scrollOffset) * duration));
  }, [zoom, scrollLeft, duration]);

  // Clique no waveform
  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const t = getTimeFromClick(e);
    offsetRef.current = t;
    setCurrentTime(t);
    if (isPlaying) { stopAll(); playAll(t); }
  }, [getTimeFromClick, isPlaying, stopAll, playAll]);

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

  const updateStem = (i: number, updates: Partial<StemTrack>) => updateStemAndSave(i, updates);

  const toggleMute = (i: number) => updateStemAndSave(i, { muted: !stems[i].muted, solo: false });
  const toggleSolo = (i: number) => {
    const isSolo = stems[i]?.solo;
    setStems((prev) => {
      const next = prev.map((s, idx) => ({ ...s, solo: idx === i ? !isSolo : false, muted: false }));
      saveStemConfigs(next);
      return next;
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  const progress = duration > 0 ? currentTime / duration : 0;
  const allReady = stems.length > 0 && stems.every((s) => s.ready);
  const loadingCount = stems.filter((s) => s.loading).length;
  const errorCount = stems.filter((s) => s.ready && !s.waveformData && !buffersRef.current[stems.indexOf(s)]).length;

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  if (loading || status === "loading") {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!album) return null;

  return (
    <div className="fixed inset-0 top-[64px] flex flex-col bg-background z-10">
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
          <button
            onClick={() => setShowMixer(v => !v)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
              showMixer ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
            )}
            title="Mixer (X)">
            🎛 Mixer
          </button>
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

      {/* Régua de tempo + grade BPM */}
      {duration > 0 && (
        <div className="flex flex-shrink-0 border-b border-border/40 bg-black/30 h-6">
          <div className="flex-shrink-0 w-44 flex items-center px-2 gap-1">
            {album.bpm && (
              <button
                onClick={() => { setShowBpmGrid((v) => !v); setBpmOffset(0); }}
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded transition-colors whitespace-nowrap",
                  showBpmGrid ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
                title="Mostrar grade de BPM"
              >♩ BPM</button>
            )}
          </div>
          {/* Controles de offset */}
          <div className="flex-shrink-0 w-36 flex items-center px-1 gap-0.5">
            {showBpmGrid && (
              <>
                <span className="text-[8px] text-muted-foreground/40 mr-0.5">offset</span>
                <button onClick={() => setBpmOffset(v => Math.round((v - 0.05) * 100) / 100)}
                  className="text-[9px] w-4 h-4 flex items-center justify-center rounded bg-muted hover:bg-muted/80 text-muted-foreground">−</button>
                <span className="text-[8px] text-amber-400/70 tabular-nums w-9 text-center">{bpmOffset.toFixed(2)}s</span>
                <button onClick={() => setBpmOffset(v => Math.round((v + 0.05) * 100) / 100)}
                  className="text-[9px] w-4 h-4 flex items-center justify-center rounded bg-muted hover:bg-muted/80 text-muted-foreground">+</button>
                <button onClick={() => setBpmOffset(0)}
                  className="text-[9px] px-1 ml-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground" title="Reset">↺</button>
              </>
            )}
          </div>
          <div className="flex-1 relative overflow-hidden pr-3" ref={rulerRef}>
            {/* Overlay arrastável para ajustar offset */}
            {showBpmGrid && (
              <div
                className="absolute inset-0 z-20 cursor-ew-resize"
                title="Arraste para alinhar a grade com o 1º tempo da música"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startOffset = bpmOffset;
                  const w = rulerRef.current?.getBoundingClientRect().width ?? 1;
                  const pxPerSec = (w * zoom) / duration;
                  const onMove = (ev: MouseEvent) => {
                    const delta = (ev.clientX - startX) / pxPerSec;
                    setBpmOffset(Math.round((startOffset + delta) * 100) / 100);
                  };
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
            )}
            <div className="absolute inset-0" style={{
              width: `${zoom * 100}%`,
              transform: `translateX(-${scrollLeft * (zoom - 1) * 100 / zoom}%)`,
            }}>
              {/* Marcações de tempo */}
              {Array.from({ length: Math.ceil(duration / (zoom < 2 ? 30 : zoom < 4 ? 15 : 5)) + 1 }).map((_, i) => {
                const interval = zoom < 2 ? 30 : zoom < 4 ? 15 : 5;
                const t = i * interval;
                if (t > duration) return null;
                const pct = (t / duration) * 100;
                return (
                  <div key={i} className="absolute top-0 flex flex-col items-start" style={{ left: `${pct}%` }}>
                    <div className="w-px h-2 bg-white/20" />
                    <span className="text-[8px] text-muted-foreground/50 tabular-nums ml-0.5 leading-none">
                      {Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")}
                    </span>
                  </div>
                );
              })}

              {/* Grade BPM com offset */}
              {showBpmGrid && album.bpm && (() => {
                const measureDur = (60 / album.bpm) * 4;
                const totalMeasures = Math.ceil((duration - bpmOffset) / measureDur) + 1;
                const pxPerMeasure = (1500 * zoom) / (duration / measureDur);
                const step = pxPerMeasure < 8 ? 8 : pxPerMeasure < 16 ? 4 : pxPerMeasure < 30 ? 2 : 1;
                return Array.from({ length: totalMeasures }).map((_, m) => {
                  if (m % step !== 0) return null;
                  const t = bpmOffset + m * measureDur;
                  if (t < 0 || t > duration) return null;
                  const pct = (t / duration) * 100;
                  return (
                    <div key={m} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${pct}%` }}>
                      <div className="w-px h-full bg-amber-400/40" />
                      <span className="absolute bottom-0 text-[7px] text-amber-400/50 tabular-nums" style={{ left: 1 }}>{m + 1}</span>
                    </div>
                  );
                });
              })()}

              {/* Playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-primary/80 z-10"
                style={{ left: `${Math.max(0, Math.min(100, (currentTime / duration * zoom - scrollLeft * (zoom - 1)) * 100))}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Faixa de marcações + controles zoom — alinhada com waveform */}
      <div className="flex-shrink-0 border-b border-border/50 bg-black/20">
        {/* Barra de controles: zoom + shortcuts */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border/30">
          <div className="flex-shrink-0 w-44" />
          <div className="flex-shrink-0 w-36" />
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Zoom:</span>
            <button onClick={() => setZoom((z) => Math.max(1, z / 1.5))} className="rounded px-1.5 py-0.5 text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground">−</button>
            <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-center">{zoom.toFixed(1)}x</span>
            <button onClick={() => setZoom((z) => Math.min(8, z * 1.5))} className="rounded px-1.5 py-0.5 text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground">+</button>
            {zoom > 1 && (
              <input type="range" min={0} max={1} step={0.001} value={scrollLeft}
                onChange={(e) => setScrollLeft(Number(e.target.value))}
                className="w-24 accent-primary h-1 ml-1" title="Scroll" />
            )}
            <button onClick={() => { setZoom(1); setScrollLeft(0); }} className="text-[9px] text-muted-foreground hover:text-foreground ml-1">Reset</button>
            {/* Botão adicionar marker */}
            <button
              onClick={() => setAddingMarker((v) => !v)}
              className={cn(
                "ml-2 text-[9px] px-2 py-0.5 rounded flex items-center gap-1 transition-colors",
                addingMarker
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
              title="Clique para ativar modo de adição de marker, depois clique na timeline"
            >
              + Marker {addingMarker && "— clique na faixa"}
            </button>
              <div className="ml-auto">
                <button
                  onClick={() => setShowShortcutsPanel((v) => !v)}
                  className="text-[9px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground flex items-center gap-1"
                >
                  ⌨️ Atalhos {showShortcutsPanel ? "▲" : "▼"}
                </button>
              </div>
            </div>
          </div>

          {/* Painel de atalhos */}
          {showShortcutsPanel && (
            <div className="flex border-b border-border/30 bg-black/30 overflow-x-auto">
              <div className="flex-shrink-0 w-44" />
              <div className="flex-shrink-0 w-36" />
              <div className="flex-1 flex gap-2 px-2 py-1.5 flex-wrap">
                {markers.map((marker, i) => (
                  <div key={i} className="flex items-center gap-1 rounded border border-border/50 px-2 py-0.5 bg-card/50">
                    <span className="text-[9px] truncate max-w-[60px]" style={{ color: marker.color }}>{marker.label}</span>
                    <button
                      onClick={() => setRecordingShortcut(recordingShortcut === i ? null : i)}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-mono font-bold min-w-[20px] text-center transition-colors",
                        recordingShortcut === i
                          ? "bg-amber-500 text-black animate-pulse"
                          : shortcuts[i]
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      title={recordingShortcut === i ? "Pressione uma tecla..." : "Clique para definir atalho"}
                    >
                      {recordingShortcut === i ? "..." : shortcuts[i] || "+"}
                    </button>
                    {shortcuts[i] && (
                      <button onClick={() => { const n = { ...shortcuts }; delete n[i]; saveShortcuts(n); }}
                        className="text-[9px] text-muted-foreground hover:text-red-400">✕</button>
                    )}
                  </div>
                ))}
                <span className="text-[9px] text-muted-foreground self-center">ESC cancela gravação</span>
              </div>
            </div>
          )}

          {/* Faixa dos markers com zoom */}
          <div className="flex h-8">
            <div className="flex-shrink-0 w-44" />
            <div className="flex-shrink-0 w-36" />
            <div
              className={cn("flex-1 relative overflow-hidden pr-3", addingMarker && "cursor-crosshair")}
              ref={waveformAreaRef}
              onClick={(e) => {
                if (!addingMarker) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                const newTime = Math.max(0, Math.min(duration, (ratio / zoom + scrollLeft * (zoom - 1) / zoom) * duration));
                const roundedTime = Math.round(newTime * 10) / 10;
                const newMarker: Marker = {
                  label: `Marker ${markers.length + 1}`,
                  time: roundedTime,
                  color: STEM_COLORS[markers.length % STEM_COLORS.length],
                };
                const updated = [...markers, newMarker].sort((a, b) => a.time - b.time);
                setMarkers(updated);
                saveMarkers(updated);
                setAddingMarker(false);
                toast(`Marker adicionado em ${formatTime(roundedTime)} — duplo clique para renomear`, { duration: 2500, icon: "📍" });
              }}
            >
              {/* Container com zoom */}
              <div className="absolute inset-0" style={{ width: `${zoom * 100}%`, transform: `translateX(-${scrollLeft * (zoom - 1) * 100 / zoom}%)` }}>
                {markers.map((marker, i) => {
                  const pct = (marker.time / duration) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 flex flex-col items-center"
                      style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                    >
                      {/* Pin draggable */}
                      <div
                        className="w-1 flex-1 cursor-ew-resize opacity-50 hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: marker.color }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const area = waveformAreaRef.current;
                          if (!area) return;
                          setDraggingMarker(i);
                          const onMove = (ev: MouseEvent) => {
                            const rect = area.getBoundingClientRect();
                            const ratio = (ev.clientX - rect.left) / rect.width;
                            const newTime = Math.max(0, Math.min(duration, (ratio / zoom + scrollLeft * (zoom - 1) / zoom) * duration));
                            setMarkers((prev) => prev.map((m, idx) => idx === i ? { ...m, time: Math.round(newTime * 10) / 10 } : m));
                          };
                          const onUp = () => {
                            setDraggingMarker(null);
                            setMarkers((prev) => { saveMarkers(prev); return prev; });
                            window.removeEventListener("mousemove", onMove);
                            window.removeEventListener("mouseup", onUp);
                          };
                          window.addEventListener("mousemove", onMove);
                          window.addEventListener("mouseup", onUp);
                        }}
                      />
                      {/* Label */}
                      <div className="absolute bottom-0 flex flex-col items-center">
                        {editingMarker === i ? (
                          <div className="flex gap-1 items-center z-20 bg-card border rounded px-1 py-0.5" style={{ borderColor: marker.color }}
                            onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              defaultValue={marker.label}
                              className="text-[9px] font-semibold bg-transparent outline-none w-16"
                              style={{ color: marker.color }}
                              onBlur={(e) => {
                                const newLabel = e.target.value.trim() || marker.label;
                                const updated = markers.map((m, idx) => idx === i ? { ...m, label: newLabel } : m);
                                setMarkers(updated); saveMarkers(updated); setEditingMarker(null);
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingMarker(null); e.stopPropagation(); }}
                            />
                            <span className="text-muted-foreground text-[8px]">|</span>
                            <input
                              value={editingMarkerTime}
                              onChange={(e) => setEditingMarkerTime(e.target.value)}
                              className="text-[9px] bg-transparent outline-none w-10 text-muted-foreground tabular-nums"
                              placeholder="0:00"
                              onBlur={(e) => {
                                const parts = e.target.value.split(":").map(Number);
                                const newTime = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
                                if (!isNaN(newTime) && newTime >= 0 && newTime <= duration) {
                                  const updated = markers.map((m, idx) => idx === i ? { ...m, time: newTime } : m);
                                  setMarkers(updated); saveMarkers(updated);
                                }
                                setEditingMarker(null);
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingMarker(null); e.stopPropagation(); }}
                            />
                          </div>
                        ) : (
                          <button
                            className="text-[9px] font-semibold px-1 py-0.5 rounded whitespace-nowrap transition-all hover:opacity-100 max-w-[80px] truncate"
                            style={{
                              backgroundColor: scheduledJump?.markerIndex === i ? marker.color + "55" : marker.color + "22",
                              color: marker.color,
                              border: `1px solid ${marker.color}${scheduledJump?.markerIndex === i ? "aa" : "44"}`,
                              opacity: scheduledJump?.markerIndex === i ? 1 : 0.85,
                            }}
                            onClick={(e) => { e.stopPropagation(); jumpToMarker(i); }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingMarker(i);
                              setEditingMarkerTime(formatTime(marker.time));
                            }}
                            title={`${shortcuts[i] ? `[${shortcuts[i]}]` : `${i + 1}.`} ${marker.label} — ${formatTime(marker.time)}\nClique: agendar loop | Duplo: editar | Arraste o pin: mover`}
                          >
                            {shortcuts[i] ? `[${shortcuts[i]}]` : `${i + 1}.`} {marker.label}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      <div className="flex-1 overflow-y-auto" onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.deltaY < 0) setZoom((z) => Math.min(8, z * 1.2));
          else setZoom((z) => Math.max(1, z / 1.2));
        }
      }}>
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

            {/* Volume + Pan + VU */}
            <div className="flex items-center gap-2 px-2 flex-shrink-0 w-44" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col gap-0.5 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-4">VOL</span>
                  <input type="range" min={0} max={1} step={0.01} value={stem.volume}
                    onChange={(e) => updateStem(i, { volume: Number(e.target.value) })}
                    className="w-14 accent-primary h-1" disabled={stem.muted} />
                </div>
                {/* VU meter horizontal */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground w-4">VU</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${Math.min(100, (stemLevels[i] || 0) * 100)}%`,
                        backgroundColor: (stemLevels[i] || 0) > 0.8 ? "#ef4444"
                          : (stemLevels[i] || 0) > 0.5 ? "#f59e0b"
                          : stem.color,
                        opacity: stem.muted ? 0.2 : 0.9,
                      }}/>
                  </div>
                </div>
              </div>
              <PanKnob value={stem.pan} onChange={(v) => updateStem(i, { pan: v })} />
            </div>

            {/* Waveform com zoom */}
            <div className="flex-1 relative overflow-hidden h-14 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); handleWaveformClick(e); }}>
              <div
                className="absolute inset-0"
                style={{
                  width: `${zoom * 100}%`,
                  transform: `translateX(-${scrollLeft * (zoom - 1) * 100 / zoom}%)`,
                }}
              >
                {stem.loading ? (
                  <div className="h-full flex items-center px-2">
                    <div className="h-1 w-full rounded bg-muted animate-pulse" />
                  </div>
                ) : stem.waveformData ? (
                  <WaveformBar
                    data={stem.waveformData}
                    progress={zoom > 1
                      ? Math.max(0, Math.min(1, currentTime / duration * zoom - scrollLeft * (zoom - 1)))
                      : progress}
                    color={stem.color}
                  />
                ) : (
                  <div className="h-full flex items-center px-2">
                    <div className="h-1 w-full rounded" style={{ backgroundColor: stem.color + "40" }} />
                  </div>
                )}
              </div>
              {/* Grade BPM — apenas início de compasso */}
              {showBpmGrid && album?.bpm && (() => {
                const measureDur = (60 / album.bpm!) * 4;
                const totalMeasures = Math.ceil((duration - bpmOffset) / measureDur) + 1;
                const pxPerMeasure = (1500 * zoom) / (duration / measureDur);
                const step = pxPerMeasure < 8 ? 8 : pxPerMeasure < 16 ? 4 : pxPerMeasure < 30 ? 2 : 1;
                return Array.from({ length: totalMeasures }).map((_, m) => {
                  if (m % step !== 0) return null;
                  const t = bpmOffset + m * measureDur;
                  if (t < 0 || t > duration) return null;
                  const pct = (t / duration) * 100;
                  return (
                    <div key={m} className="absolute top-0 bottom-0 pointer-events-none z-10"
                      style={{ left: `${pct}%`, width: 1, backgroundColor: "rgba(251,191,36,0.2)" }} />
                  );
                });
              })()}
              {/* Playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-white/40 pointer-events-none z-10"
                style={{ left: `${Math.max(0, Math.min(100, (currentTime / duration * zoom - scrollLeft * (zoom - 1)) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Transport bar — fixo no rodapé */}
      <div className="border-t border-border bg-card px-5 py-3 flex-shrink-0">

        {/* Scheduled jump indicator */}
        {scheduledJump && (
          <div className="flex items-center justify-between mb-2 rounded-lg px-3 py-1.5 text-xs"
            style={{ backgroundColor: scheduledJump.color + "20", border: `1px solid ${scheduledJump.color}40` }}>
            <div className="flex items-center gap-2">
              <span className="animate-pulse text-base">🔁</span>
              <span style={{ color: scheduledJump.color }} className="font-semibold">
                Repetindo "{scheduledJump.label}" ao fim desta seção
              </span>
            </div>
            <button
              onClick={() => { scheduledJumpRef.current = null; setScheduledJump(null); toast("Repetição cancelada", { duration: 1200 }); }}
              className="rounded px-2 py-0.5 text-[10px] font-semibold hover:bg-white/10 transition-colors"
              style={{ color: scheduledJump.color }}
            >
              Cancelar ✕
            </button>
          </div>
        )}
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
            {/* Seekbar */}
            <div className="relative h-2 cursor-pointer" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - rect.left) / rect.width) * duration;
              offsetRef.current = t; setCurrentTime(t);
              if (isPlaying) { stopAll(); playAll(t); }
            }}>
              <div className="absolute inset-0 rounded-full bg-muted" />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
              {/* Pins coloridos das marcações */}
              {markers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-0.5 opacity-60 hover:opacity-100 cursor-pointer"
                  style={{ left: `${(marker.time / duration) * 100}%`, backgroundColor: marker.color }}
                  onClick={(e) => { e.stopPropagation(); jumpToMarker(i); }}
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
          <span><kbd className="rounded bg-muted px-1">+</kbd><kbd className="rounded bg-muted px-1">−</kbd> zoom</span>
          <span><kbd className="rounded bg-muted px-1">X</kbd> mixer</span>
          {markers.length > 0 && <span><kbd className="rounded bg-muted px-1">1-9</kbd> markers | <kbd className="rounded bg-muted px-1">⌨️</kbd> customize</span>}
          {selectedStem !== null && (
            <span className="text-primary/60">Canal: <span style={{ color: stems[selectedStem]?.color }}>{stems[selectedStem]?.name}</span></span>
          )}
          {recordingShortcut !== null && (
            <span className="text-amber-400 animate-pulse">🎹 Pressione uma tecla para o marker "{markers[recordingShortcut]?.label}"</span>
          )}
        </div>
      </div>

      {/* MIXER FLUTUANTE */}
      {showMixer && (
        <div className="fixed bottom-[120px] left-1/2 -translate-x-1/2 z-50 flex flex-col rounded-2xl border border-white/10 bg-[#0f1117]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          style={{maxWidth:"calc(100vw - 32px)", width: Math.max(stems.length * 80 + 32, 400)}}>
          {/* Header do mixer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8 bg-black/30">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white/70 uppercase tracking-widest">Mixer</span>
              <span className="text-[10px] text-white/30">{stems.length} canais</span>
            </div>
            <button onClick={() => setShowMixer(false)} className="text-white/30 hover:text-white/60 text-xs border border-white/10 rounded px-2 py-0.5">✕ X</button>
          </div>

          {/* Canais */}
          <div className="flex overflow-x-auto">
            {stems.map((stem, idx) => {
              const isSoloing = stems.some(s => s.solo);
              const isAudible = stem.solo || (!isSoloing && !stem.muted);
              return (
                <div key={idx} className="flex flex-col items-center gap-2 px-3 py-3 border-r border-white/5 flex-shrink-0"
                  style={{width:80}}>

                  {/* Nome editável */}
                  <div className="w-full text-center">
                    <p className="text-[9px] font-bold truncate w-full text-center"
                      style={{color: isAudible ? stem.color : "rgba(255,255,255,0.2)"}}>
                      {stem.name}
                    </p>
                  </div>

                  {/* EQ simples + VU em tempo real */}
                  <div className="flex gap-0.5 items-end h-5 w-full justify-center">
                    {[0,1,2,3,4,5,6].map((bi)=>{
                      const level = stemLevels[idx] || 0;
                      const barH = isAudible ? Math.min(1, level * (0.4 + bi * 0.08) + 0.1) : 0.1;
                      return (
                        <div key={bi} className="flex-1 rounded-sm transition-none"
                          style={{
                            height:`${barH*100}%`,
                            backgroundColor: level > 0.8 ? "#ef4444"
                              : level > 0.5 ? "#f59e0b"
                              : isAudible ? stem.color : "rgba(255,255,255,0.08)",
                          }}/>
                      );
                    })}
                  </div>

                  {/* Pan knob */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="relative w-8 h-8">
                      <svg viewBox="0 0 32 32" className="w-8 h-8 cursor-ew-resize"
                        onMouseDown={e=>{
                          e.preventDefault();
                          const startX=e.clientX, startPan=stem.pan;
                          const onMove=(ev:MouseEvent)=>{
                            const delta=(ev.clientX-startX)/60;
                            updateStem(idx,{pan:Math.max(-1,Math.min(1,startPan+delta))});
                          };
                          const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
                          window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
                        }}
                        onDoubleClick={()=>updateStem(idx,{pan:0})}>
                        <circle cx="16" cy="16" r="12" fill="#1a1f2e" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
                        <circle cx="16" cy="16" r="8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2"/>
                        {/* Indicador pan */}
                        <circle
                          cx={16 + stem.pan * 7}
                          cy="16"
                          r="2.5"
                          fill={isAudible?stem.color:"rgba(255,255,255,0.2)"}/>
                        {/* Linha central */}
                        <line x1="16" y1="8" x2="16" y2="12" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                      </svg>
                    </div>
                    <span className="text-[8px] text-white/25 tabular-nums">
                      {stem.pan===0?"C":stem.pan>0?`R${Math.round(stem.pan*100)}`:`L${Math.round(Math.abs(stem.pan)*100)}`}
                    </span>
                  </div>

                  {/* Fader vertical + VU lateral */}
                  <div className="flex items-center gap-1 h-24">
                    {/* VU bar fina */}
                    <div className="w-1 h-full rounded-full bg-white/5 overflow-hidden flex flex-col-reverse">
                      <div className="w-full rounded-full transition-none"
                        style={{
                          height:`${Math.min(100,(stemLevels[idx]||0)*100)}%`,
                          backgroundColor:(stemLevels[idx]||0)>0.8?"#ef4444":(stemLevels[idx]||0)>0.5?"#f59e0b":stem.color,
                          opacity: isAudible ? 0.9 : 0.1,
                        }}/>
                    </div>
                    <div className="relative h-full flex flex-col items-center justify-center"
                      style={{width:16}}>
                      <div className="relative w-1.5 h-full rounded-full bg-white/5">
                        <div className="absolute bottom-0 left-0 right-0 rounded-full transition-all"
                          style={{height:`${stem.volume*100}%`, backgroundColor:isAudible?stem.color+"60":"rgba(255,255,255,0.1)"}}/>
                        <div className="absolute left-1/2 -translate-x-1/2 w-4 h-2.5 rounded bg-white/80 shadow cursor-ns-resize border border-white/20"
                          style={{bottom:`calc(${stem.volume*100}% - 5px)`}}
                          onMouseDown={e=>{
                            e.preventDefault();
                            const el=e.currentTarget.parentElement!;
                            const rect=el.getBoundingClientRect();
                            const onMove=(ev:MouseEvent)=>{
                              const v=Math.max(0,Math.min(1,1-(ev.clientY-rect.top)/rect.height));
                              updateStem(idx,{volume:v});
                              if(gainNodesRef.current[idx]) gainNodesRef.current[idx].gain.value = stem.muted?0:v;
                            };
                            const onUp=()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
                            window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
                          }}/>
                      </div>
                    </div>
                    {/* dB scale */}
                    <div className="flex flex-col justify-between h-full text-[7px] text-white/20 leading-none">
                      <span>0</span>
                      <span>-6</span>
                      <span>-12</span>
                      <span>-24</span>
                      <span>-∞</span>
                    </div>
                  </div>

                  {/* Valor volume */}
                  <span className="text-[8px] text-white/30 tabular-nums">{Math.round(stem.volume*100)}</span>

                  {/* M / S */}
                  <div className="flex gap-1 w-full">
                    <button
                      onClick={()=>updateStem(idx,{muted:!stem.muted, solo:false})}
                      className={cn("flex-1 rounded text-[9px] font-black py-1 transition-all border",
                        stem.muted?"bg-red-500/30 border-red-500/50 text-red-400":"border-white/10 text-white/30 hover:text-white/60")}>
                      M
                    </button>
                    <button
                      onClick={()=>setStems(prev=>prev.map((s,i)=>({...s,solo:i===idx?!stem.solo:false,muted:false})))}
                      className={cn("flex-1 rounded text-[9px] font-black py-1 transition-all border",
                        stem.solo?"bg-amber-500/30 border-amber-500/50 text-amber-400":"border-white/10 text-white/30 hover:text-white/60")}>
                      S
                    </button>
                  </div>

                  {/* Cor do canal */}
                  <div className="h-1 w-full rounded-full opacity-60" style={{backgroundColor:stem.color}}/>
                </div>
              );
            })}

            {/* Master */}
            <div className="flex flex-col items-center gap-2 px-3 py-3 flex-shrink-0 bg-white/3 border-l border-white/10" style={{width:70}}>
              <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Master</p>
              <div className="h-4 w-full"/>
              <div className="h-8 w-full"/>
              <div className="relative h-24 w-4">
                <div className="w-1.5 h-full rounded-full bg-white/5 mx-auto relative">
                  <div className="absolute bottom-0 left-0 right-0 rounded-full bg-primary/40" style={{height:"80%"}}/>
                  <div className="absolute left-1/2 -translate-x-1/2 w-4 h-2.5 rounded bg-white shadow cursor-ns-resize border border-white/20" style={{bottom:"calc(80% - 5px)"}}/>
                </div>
              </div>
              <span className="text-[8px] text-white/30">100</span>
              <div className="flex gap-1 w-full">
                <div className="flex-1 rounded border border-white/5 py-1"/>
                <div className="flex-1 rounded border border-white/5 py-1"/>
              </div>
              <div className="h-1 w-full rounded-full bg-primary/40"/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
