"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Sliders, Music2, Play, Pause, Download, Trash2, Plus, Lock, Loader2, CheckCircle2, ArrowLeft, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Album { id: string; title: string; artist: string; coverUrl: string | null; bpm: number | null; musicalKey: string | null; }
interface StemConfig { index: number; name: string; included: boolean; pan: number; volume: number; solo: boolean; }
interface CustomMix { id: string; name: string; albumId: string; config: any; createdAt: string; durationSec: number | null; album: { title: string; artist: string; coverUrl: string | null }; }

const PRESETS = [
  { key: "click-right", label: "Click+Guia → D",  apply: (s: StemConfig[]) => s.map(x => ({ ...x, pan: /click|guia|guide/i.test(x.name) ?  0.85 : -0.85, included: true, solo: false })) },
  { key: "click-left",  label: "Click+Guia → E",  apply: (s: StemConfig[]) => s.map(x => ({ ...x, pan: /click|guia|guide/i.test(x.name) ? -0.85 :  0.85, included: true, solo: false })) },
  { key: "vocals-right",label: "Vocais → D",      apply: (s: StemConfig[]) => s.map(x => ({ ...x, pan: /vocal|voice|voz/i.test(x.name)   ?  0.85 : -0.85, included: true, solo: false })) },
  { key: "center",      label: "Centralizado",    apply: (s: StemConfig[]) => s.map(x => ({ ...x, pan: 0, included: true, solo: false })) },
];

const CHANNEL_COLORS = ["#a78bfa","#818cf8","#f87171","#fb923c","#facc15","#4ade80","#34d399","#22d3ee","#60a5fa","#e879f9","#f472b6","#94a3b8","#a3e635","#2dd4bf","#c084fc"];

// ── Pan Knob SVG ─────────────────────────────────────────────────────────────
function PanKnob({ value, onChange, color, disabled }: { value: number; onChange: (v: number) => void; color: string; disabled?: boolean }) {
  const dragging = useRef(false);
  const startX = useRef(0); const startVal = useRef(0);
  const angle = value * 135;
  const rad = (angle - 90) * (Math.PI / 180);
  const cx = 16, cy = 16, r = 11;
  const dotX = cx + r * Math.cos(rad);
  const dotY = cy + r * Math.sin(rad);
  const label = value < -0.04 ? `L${Math.round(Math.abs(value)*100)}` : value > 0.04 ? `R${Math.round(value*100)}` : "C";
  const lc = value < -0.04 ? "#60a5fa" : value > 0.04 ? "#f87171" : "#6b7280";
  const onMD = (e: React.MouseEvent) => {
    if (disabled) return;
    dragging.current = true; startX.current = e.clientX; startVal.current = value;
    const mv = (ev: MouseEvent) => { if (!dragging.current) return; onChange(Math.max(-1, Math.min(1, startVal.current + (ev.clientX - startX.current) / 80))); };
    const up = () => { dragging.current = false; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  return (
    <div className="flex flex-col items-center gap-0.5 select-none" title="Pan · arraste · duplo clique=centro">
      <svg width="32" height="32" viewBox="0 0 32 32" className={disabled ? "opacity-30" : "cursor-ew-resize"} onMouseDown={onMD} onDoubleClick={() => !disabled && onChange(0)}>
        <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5"/>
        {Math.abs(value) > 0.02 && <path d={`M ${cx} ${cy-r} A ${r} ${r} 0 0 ${value>0?1:0} ${dotX} ${dotY}`} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>}
        <line x1={cx} y1={cy-r+1} x2={cx} y2={cy-r+4} stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
        <circle cx={dotX} cy={dotY} r="2.5" fill={disabled?"#555":color} style={{filter: disabled?"none":`drop-shadow(0 0 3px ${color})`}}/>
      </svg>
      <span className="text-[9px] font-bold tabular-nums" style={{color: disabled?"#555":lc}}>{label}</span>
    </div>
  );
}

// ── VU Meter barra horizontal — atualizado via DOM ref, zero re-renders ────────
// Mesmo padrão do player de multitrack
function updateVuDom(el: HTMLDivElement | null, level: number, color: string, muted: boolean) {
  if (!el) return;
  const pct = muted ? 0 : Math.min(100, level * 100);
  el.style.width = `${pct}%`;
  el.style.backgroundColor = (!muted && level > 0.8) ? "#ef4444" : (!muted && level > 0.5) ? "#f59e0b" : color;
}

// ── Fader vertical ────────────────────────────────────────────────────────────
function Fader({ value, onChange, color, disabled }: { value: number; onChange: (v: number) => void; color: string; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const onMD = (e: React.MouseEvent) => {
    if (disabled) return;
    dragging.current = true;
    const move = (ev: MouseEvent) => {
      if (!dragging.current || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const v = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
      onChange(v);
    };
    const up = () => { dragging.current = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const pct = value * 100;
  return (
    <div ref={trackRef} className="relative w-4 rounded-full bg-black/40 border border-white/5 cursor-ns-resize select-none" style={{ height: 90 }} onMouseDown={onMD} onDoubleClick={() => !disabled && onChange(1)}>
      {/* Rail fill */}
      <div className="absolute bottom-0 left-0 right-0 rounded-full transition-none" style={{ height: `${pct}%`, background: disabled ? "rgba(255,255,255,0.06)" : `linear-gradient(0deg, ${color}40, ${color}90)` }} />
      {/* Handle */}
      <div className="absolute left-1/2 -translate-x-1/2 rounded-sm border border-white/20 shadow-lg" style={{ width: 22, height: 10, bottom: `calc(${pct}% - 5px)`, background: disabled ? "rgba(80,80,80,0.6)" : "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(200,200,200,0.65))", boxShadow: disabled ? "none" : `0 0 6px ${color}60` }} />
      {/* dB marks */}
      {[0, 25, 50, 75, 100].map(p => (
        <div key={p} className="absolute right-5 text-[7px] text-white/20 tabular-nums leading-none" style={{ bottom: `${p}%`, transform: "translateY(50%)" }}>
          {p === 100 ? "0" : p === 75 ? "-6" : p === 50 ? "-12" : p === 25 ? "-24" : "∞"}
        </div>
      ))}
    </div>
  );
}

// ── Canal do mixer ────────────────────────────────────────────────────────────
function MixerChannel({ sc, idx, color, vuBarRef, onChange, onPreview, previewing, hasSolo }: {
  sc: StemConfig; idx: number; color: string;
  vuBarRef: (el: HTMLDivElement | null) => void;
  onChange: (u: Partial<StemConfig>) => void;
  onPreview: () => void; previewing: boolean; hasSolo: boolean;
}) {
  const muted = !sc.included || (hasSolo && !sc.solo);
  return (
    <div className={cn("flex flex-col items-center rounded-xl border transition-all select-none", "bg-[#0f0f12] border-white/8", previewing && "ring-1 ring-primary/20 border-primary/20", muted && "opacity-50")} style={{ minWidth: 72, borderTop: `2px solid ${color}` }}>
      {/* Nome */}
      <div className="w-full px-1.5 pt-2 pb-1">
        <p className="text-[9px] font-bold text-center truncate w-full" style={{ color }} title={sc.name}>{sc.name}</p>
      </div>
      {/* VU barra + Fader */}
      <div className="flex items-end gap-1.5 px-2 py-1">
        {/* VU horizontal igual ao player de multitrack */}
        <div className="flex flex-col justify-end gap-0.5" style={{ height: 90, width: 10 }}>
          <div className="w-full rounded-full bg-white/5 overflow-hidden flex-shrink-0" style={{ height: 4 }}>
            <div
              ref={vuBarRef}
              className="h-full rounded-full"
              style={{ width: "0%", backgroundColor: color, transition: "width 60ms linear" }}
            />
          </div>
        </div>
        <Fader value={sc.volume} onChange={v => onChange({ volume: v })} color={color} disabled={muted} />
      </div>
      {/* Vol label */}
      <span className="text-[9px] tabular-nums mb-1" style={{ color: muted ? "#444" : color + "cc" }}>{Math.round(sc.volume * 100)}</span>
      {/* Pan knob */}
      <div className="px-2 pb-1">
        <PanKnob value={sc.pan} onChange={v => onChange({ pan: v })} color={color} disabled={muted} />
      </div>
      {/* Botões MUTE SOLO PREVIEW */}
      <div className="flex gap-1 px-1.5 pb-2 w-full">
        <button onClick={() => onChange({ included: !sc.included, solo: false })}
          className={cn("flex-1 rounded py-1 text-[8px] font-black border transition-all",
            !sc.included ? "bg-red-500/30 border-red-500/50 text-red-400" : "bg-white/5 border-white/8 text-white/40 hover:text-white/70"
          )}>M</button>
        <button onClick={() => onChange({ solo: !sc.solo, included: true })}
          className={cn("flex-1 rounded py-1 text-[8px] font-black border transition-all",
            sc.solo ? "bg-amber-500/30 border-amber-500/50 text-amber-400" : "bg-white/5 border-white/8 text-white/40 hover:text-white/70"
          )}>S</button>
        <button onClick={onPreview}
          className={cn("flex-1 rounded py-1 text-[8px] font-black border transition-all",
            previewing ? "bg-primary/30 border-primary/50 text-primary" : "bg-white/5 border-white/8 text-white/40 hover:text-white/70"
          )} title={previewing ? "Parar prévia" : "Ouvir prévia"}>
          {previewing ? "■" : "▶"}
        </button>
      </div>
    </div>
  );
}

// ── Mix Card ─────────────────────────────────────────────────────────────────
function MixCard({ mix, onPlay, onDelete, isPlaying }: { mix: CustomMix; onPlay: (m: CustomMix) => void; onDelete: (id: string) => void; isPlaying: boolean }) {
  return (
    <Card className={cn("transition-all", isPlaying && "border-primary/40 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {mix.album.coverUrl ? <img src={mix.album.coverUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" /> : <div className="h-12 w-12 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center"><Music2 className="h-5 w-5 text-muted-foreground/40" /></div>}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{mix.name}</p>
            <p className="text-xs text-muted-foreground truncate">{mix.album.title} — {mix.album.artist}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{new Date(mix.createdAt).toLocaleDateString("pt-BR")}{mix.durationSec && ` · ${Math.floor(mix.durationSec/60)}:${String(Math.floor(mix.durationSec%60)).padStart(2,"0")}`}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onPlay(mix)} className={cn("p-1.5 rounded-lg transition-colors", isPlaying ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button onClick={() => onDelete(mix.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-muted transition-colors"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {(mix.config.stems as StemConfig[]).filter(s => s.included).map((s, i) => {
            const pl = s.pan < -0.04 ? `L${Math.round(Math.abs(s.pan)*100)}` : s.pan > 0.04 ? `R${Math.round(s.pan*100)}` : "C";
            return <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[9px]">{s.name} <span className={cn("font-bold", s.pan < -0.04 ? "text-blue-400" : s.pan > 0.04 ? "text-red-400" : "text-muted-foreground")}>{pl}</span></span>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── WAV encoder ───────────────────────────────────────────────────────────────
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const nc = buffer.numberOfChannels, sr = buffer.sampleRate, dl = buffer.length * nc * 2;
  const ab = new ArrayBuffer(44 + dl); const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  ws(0,"RIFF"); v.setUint32(4,36+dl,true); ws(8,"WAVE"); ws(12,"fmt ");
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*nc*2,true); v.setUint16(32,nc*2,true); v.setUint16(34,16,true);
  ws(36,"data"); v.setUint32(40,dl,true);
  let off=44;
  for (let i=0;i<buffer.length;i++) for (let c=0;c<nc;c++) { const s=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i])); v.setInt16(off,s<0?s*0x8000:s*0x7fff,true); off+=2; }
  return ab;
}

// ── Cache em memória (por sessão) + Cache API quando disponível (7 dias) ──────
const AUDIO_CACHE_NAME = "liderweb-stems-v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Cache em memória — sempre funciona, dura a sessão
const memoryAudioCache = new Map<string, ArrayBuffer>();

async function fetchAudioCached(url: string): Promise<ArrayBuffer> {
  // 1. Cache em memória (sessão atual)
  if (memoryAudioCache.has(url)) {
    return memoryAudioCache.get(url)!.slice(0);
  }

  // 2. Cache API (persiste entre sessões — só funciona em HTTPS ou localhost)
  try {
    if ("caches" in window) {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) {
        const cachedAt = cached.headers.get("x-cached-at");
        const expired = cachedAt && (Date.now() - Number(cachedAt)) > CACHE_TTL_MS;
        if (!expired) {
          const buf = await cached.arrayBuffer();
          memoryAudioCache.set(url, buf.slice(0));
          return buf;
        }
        await cache.delete(url);
      }
    }
  } catch {}

  // 3. Fetch da rede
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar áudio: ${res.status}`);
  const buf = await res.arrayBuffer();

  // Salvar no cache em memória
  memoryAudioCache.set(url, buf.slice(0));

  // Salvar no Cache API (silencioso se não disponível)
  try {
    if ("caches" in window) {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      await cache.put(url, new Response(buf.slice(0), {
        headers: { "Content-Type": "audio/wav", "x-cached-at": String(Date.now()) },
      }));
    }
  } catch {}

  return buf;
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CustomMixPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [mixes, setMixes] = useState<CustomMix[]>([]);
  const [quota, setQuota] = useState({ limit: 0, used: 0, remaining: 0 });
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [blockedByPermission, setBlockedByPermission] = useState(false);

  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumSearch, setAlbumSearch] = useState("");
  const [filterRentedMix, setFilterRentedMix] = useState(false);
  const [stemConfigs, setStemConfigs] = useState<StemConfig[]>([]);
  const [mixName, setMixName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("custom");
  const [bouncing, setBouncing] = useState(false);
  const [loadingStems, setLoadingStems] = useState(false);
  const [masterVol, setMasterVol] = useState(1);

  // VU meters via DOM refs (zero re-renders — sem useState)
  const vuBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const vuColors = useRef<string[]>([]);
  const analyserNodes = useRef<AnalyserNode[]>([]);

  // Preview individual
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const previewGainRef = useRef<GainNode | null>(null);
  const previewPanRef = useRef<StereoPannerNode | null>(null);
  const previewBufsRef = useRef<Map<number, AudioBuffer>>(new Map());
  const vuRafRef = useRef<number>(0);

  // Play All — preview do mix completo
  const [playingAll, setPlayingAll] = useState(false);
  const [playAllProgress, setPlayAllProgress] = useState(0);
  const [playAllDuration, setPlayAllDuration] = useState(0);
  const [loadingAll, setLoadingAll] = useState(false);
  const playAllCtxRef = useRef<AudioContext | null>(null);
  const playAllSrcsRef = useRef<AudioBufferSourceNode[]>([]);
  const playAllGainsRef = useRef<GainNode[]>([]);
  const playAllPansRef = useRef<StereoPannerNode[]>([]);
  const playAllAnalysersRef = useRef<AnalyserNode[]>([]);
  const playAllStartRef = useRef(0);
  const playAllIntervalRef = useRef<any>(null);

  // Player mixes salvos
  const [playingMixId, setPlayingMixId] = useState<string | null>(null);
  const [playerMix, setPlayerMix] = useState<CustomMix | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const playerIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!user) { router.replace("/dashboard"); return; }
    // Acesso controlado pela API (billing + RBAC) — não bloqueia por role aqui
    loadData();
    return () => { cancelAnimationFrame(vuRafRef.current); };
  }, [status, user]);

  useEffect(() => { stopPreview(); stopPlayAll(); previewBufsRef.current.clear(); analyserNodes.current = []; vuBarRefs.current = []; }, [selectedAlbum]);

  const addExtraToCart = async () => {
    try {
      const prodRes = await fetch("/api/billing/products?type=CUSTOM_MIX_EXTRA");
      if (!prodRes.ok) { toast.error("Produto não disponível"); return; }
      const prodData = await prodRes.json();
      const product = prodData.products?.[0];
      if (!product) { toast.error("Produto Custom Mix Avulso não encontrado. Configure em Products Admin."); return; }
      const cartRes = await fetch("/api/billing/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", productId: product.id, quantity: 1, metadata: {} }),
      });
      if (!cartRes.ok) { const e = await cartRes.json(); toast.error(e.error || "Erro ao adicionar ao carrinho"); return; }
      router.push("/cart");
    } catch (err: any) { toast.error(err.message); }
  };

  const loadData = async () => {
    try {
      const [mr, ar] = await Promise.all([fetch("/api/custom-mix"), fetch("/api/multitracks?limit=50")]);
      if (mr.status === 402) { setBlocked(true); setLoading(false); return; }
      if (mr.status === 403) { setBlockedByPermission(true); setLoading(false); return; }
      const md = await mr.json();
      if (!mr.ok) { setBlocked(true); setLoading(false); return; }
      setMixes(md.mixes ?? []); setQuota(md.quota ?? { limit:0, used:0, remaining:0 });
      if (ar.ok) setAlbums((await ar.json()).albums ?? []);
    } catch { toast.error("Erro ao carregar"); }
    finally { setLoading(false); }
  };

  const selectAlbum = async (album: Album) => {
    setSelectedAlbum(album); setStemConfigs([]);
    setMixName(`${album.title} — Custom Mix`); setSelectedPreset("custom");
    setLoadingStems(true);
    try {
      const res = await fetch(`/api/multitracks/${album.id}/stems`);
      if (!res.ok) { toast.error("Alugue esta multitrack primeiro."); setSelectedAlbum(null); return; }
      const data = await res.json();
      const stems: { name: string }[] = (data.stems ?? []).filter((s: any) => !s.name.startsWith("."));
      setStemConfigs(stems.map((s, i) => ({ index: i, name: s.name, included: true, pan: 0, volume: 1, solo: false })));
    } catch { toast.error("Erro ao carregar faixas."); setSelectedAlbum(null); }
    finally { setLoadingStems(false); }
  };

  const applyPreset = (key: string) => {
    const p = PRESETS.find(x => x.key === key); if (!p) return;
    setSelectedPreset(key); setStemConfigs(prev => p.apply(prev));
  };

  const updateStem = (i: number, u: Partial<StemConfig>) => {
    setStemConfigs(prev => {
      const next = prev.map((s, idx) => idx === i ? { ...s, ...u } : s);
      const finalConfigs = u.solo === true ? next.map((s, idx) => idx === i ? s : { ...s, solo: false }) : next;
      // Atualizar em tempo real se play all ativo (usar novos configs)
      if (playingAll) {
        // Se mudou solo, atualizar todos os canais
        if (u.solo !== undefined) {
          finalConfigs.forEach((sc, idx) => updateStemLive(idx, {}, finalConfigs));
        } else {
          updateStemLive(i, u, finalConfigs);
        }
      }
      return finalConfigs;
    });
    // Atualizar preview individual em tempo real
    if (previewingIdx === i && previewCtxRef.current) {
      if (u.pan !== undefined && previewPanRef.current) previewPanRef.current.pan.value = u.pan;
      if (u.volume !== undefined && previewGainRef.current) previewGainRef.current.gain.value = u.volume;
    }
  };

  // VU meter loop via rAF
  // Ref para stemConfigs para evitar closure stale no rAF loop
  const stemConfigsRef = useRef<StemConfig[]>([]);
  useEffect(() => { stemConfigsRef.current = stemConfigs; }, [stemConfigs]);

  const startVuLoop = useCallback((analysers: AnalyserNode[], colorsList?: string[]) => {
    cancelAnimationFrame(vuRafRef.current);
    const dataArray = new Uint8Array(32); // igual ao player de multitrack
    const tick = () => {
      const configs = stemConfigsRef.current;
      const hasSol = configs.some(s => s.solo);
      analysers.forEach((an, i) => {
        if (!an) return;
        an.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let k = 0; k < dataArray.length; k++) {
          const v = (dataArray[k] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const sc = configs[i];
        const muted = sc ? (!sc.included || (hasSol && !sc.solo)) : false;
        const level = muted ? 0 : Math.min(1, rms * 4);
        const color = colorsList?.[i] ?? vuColors.current[i] ?? "#8b5cf6";
        updateVuDom(vuBarRefs.current[i] ?? null, level, color, muted);
      });
      vuRafRef.current = requestAnimationFrame(tick);
    };
    vuRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPreview = () => {
    cancelAnimationFrame(vuRafRef.current);
    try { previewSrcRef.current?.stop(); } catch {}
    previewSrcRef.current = null; previewGainRef.current = null; previewPanRef.current = null;
    setPreviewingIdx(null);
    // Limpar VU via DOM
    vuBarRefs.current.forEach((el, i) => updateVuDom(el, 0, vuColors.current[i] ?? "#8b5cf6", true));
  };

  const stopPlayAll = () => {
    cancelAnimationFrame(vuRafRef.current);
    clearInterval(playAllIntervalRef.current);
    playAllSrcsRef.current.forEach(s => { try { s.stop(); } catch {} });
    playAllSrcsRef.current = []; playAllGainsRef.current = []; playAllPansRef.current = []; playAllAnalysersRef.current = [];
    setPlayingAll(false); setPlayAllProgress(0);
    vuBarRefs.current.forEach((el, i) => updateVuDom(el, 0, vuColors.current[i] ?? "#8b5cf6", true));
  };

  const togglePlayAll = async () => {
    if (playingAll) { stopPlayAll(); return; }
    // Parar player de mix salvo se estiver tocando
    if (isPlaying) {
      sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
      clearInterval(playerIntervalRef.current);
      setIsPlaying(false); setPlayingMixId(null); setPlayerMix(null); setProgress(0);
    }
    if (!selectedAlbum) return;

    const included = stemConfigs.filter(s => s.included);
    if (included.length === 0) { toast.error("Nenhuma faixa ativa"); return; }

    stopPreview();
    setLoadingAll(true);

    if (!playAllCtxRef.current || playAllCtxRef.current.state === "closed") {
      playAllCtxRef.current = new AudioContext();
    }
    const ctx = playAllCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    try {
      toast.loading("Carregando faixas...", { id: "playall" });

      // Carregar todos os buffers (com cache)
      const bufs = await Promise.all(stemConfigs.map(async sc => {
        let buf = previewBufsRef.current.get(sc.index);
        if (!buf) {
          const url = `/api/multitracks/${selectedAlbum.id}/audio/${sc.index}`;
          buf = await ctx.decodeAudioData(await fetchAudioCached(url));
          previewBufsRef.current.set(sc.index, buf);
        }
        return { sc, buffer: buf! };
      }));

      const maxDur = Math.max(...bufs.map(b => b.buffer.duration));
      setPlayAllDuration(maxDur);

      const masterGain = ctx.createGain();
      masterGain.gain.value = masterVol;
      masterGain.connect(ctx.destination);

      const srcs: AudioBufferSourceNode[] = [];
      const gains: GainNode[] = [];
      const pans: StereoPannerNode[] = [];
      const analysers: AnalyserNode[] = [];

      const startAt = ctx.currentTime + 0.05;
      playAllStartRef.current = startAt;

      bufs.forEach(({ sc, buffer }) => {
        const src = ctx.createBufferSource(); src.buffer = buffer;
        const gain = ctx.createGain(); gain.gain.value = sc.included ? sc.volume : 0;
        const hasSol = stemConfigs.some(s => s.solo);
        if (hasSol) gain.gain.value = sc.solo ? sc.volume : 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = sc.pan;
        const analyser = ctx.createAnalyser(); analyser.fftSize = 64;
        src.connect(gain); gain.connect(pan); pan.connect(analyser); analyser.connect(masterGain);
        src.start(startAt);
        srcs.push(src); gains.push(gain); pans.push(pan); analysers.push(analyser);
      });

      playAllSrcsRef.current = srcs;
      playAllGainsRef.current = gains;
      playAllPansRef.current = pans;
      playAllAnalysersRef.current = analysers;

      setPlayingAll(true);
      toast.dismiss("playall");

      // VU loop com cores dos canais
      startVuLoop(analysers, stemConfigs.map((_, i) => CHANNEL_COLORS[i % CHANNEL_COLORS.length]));

      // Progress
      playAllIntervalRef.current = setInterval(() => {
        const elapsed = ctx.currentTime - startAt;
        setPlayAllProgress(Math.min(1, elapsed / maxDur));
        if (elapsed >= maxDur) { stopPlayAll(); }
      }, 100);

      srcs[0].onended = () => {};

    } catch (err: any) {
      toast.dismiss("playall");
      toast.error(err.message);
      setPlayingAll(false);
    } finally {
      setLoadingAll(false);
    }
  };

  // Atualizar gain/pan em tempo real durante play all
  const updateStemLive = (i: number, u: Partial<StemConfig>, newConfigs?: StemConfig[]) => {
    if (!playAllCtxRef.current || !playAllGainsRef.current[i]) return;
    const t = playAllCtxRef.current.currentTime;
    const configs = newConfigs ?? stemConfigs;
    const sc = { ...configs[i], ...u };
    const hasSol = configs.some((s, idx) => idx !== i ? s.solo : (u.solo !== undefined ? u.solo : s.solo));
    const isSolo = u.solo !== undefined ? u.solo : configs[i]?.solo;
    const included = u.included !== undefined ? u.included : configs[i]?.included;
    const effectiveVol = (!included || (hasSol && !isSolo)) ? 0 : (u.volume ?? sc.volume ?? 1);
    playAllGainsRef.current[i].gain.setTargetAtTime(effectiveVol, t, 0.015);
    if (playAllPansRef.current[i] && u.pan !== undefined) {
      playAllPansRef.current[i].pan.setTargetAtTime(u.pan, t, 0.015);
    }
  };

  const previewStem = async (sc: StemConfig) => {
    if (!selectedAlbum) return;
    if (previewingIdx === sc.index) { stopPreview(); return; }
    stopPreview();
    if (!previewCtxRef.current) previewCtxRef.current = new AudioContext();
    const ctx = previewCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    setPreviewingIdx(sc.index);
    try {
      let buf = previewBufsRef.current.get(sc.index);
      if (!buf) {
        toast.loading(`Carregando ${sc.name}...`, { id: "prev" });
        const url = `/api/multitracks/${selectedAlbum.id}/audio/${sc.index}`;
        const ab = await fetchAudioCached(url);
        buf = await ctx.decodeAudioData(ab);
        previewBufsRef.current.set(sc.index, buf);
        toast.dismiss("prev");
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gain = ctx.createGain(); gain.gain.value = sc.volume;
      const pan = ctx.createStereoPanner(); pan.pan.value = sc.pan;
      const analyser = ctx.createAnalyser(); analyser.fftSize = 64;
      src.connect(gain); gain.connect(pan); pan.connect(analyser); analyser.connect(ctx.destination);
      src.start(0);
      previewSrcRef.current = src; previewGainRef.current = gain; previewPanRef.current = pan;
      // Criar array de analysers — só o canal ativo tem sinal
      const analysers = stemConfigs.map((_, i) => i === sc.index ? analyser : ctx.createAnalyser());
      startVuLoop(analysers, CHANNEL_COLORS.map((_, i) => CHANNEL_COLORS[i % CHANNEL_COLORS.length]));
      src.onended = () => { cancelAnimationFrame(vuRafRef.current); setPreviewingIdx(null); vuBarRefs.current.forEach((el, i) => updateVuDom(el, 0, vuColors.current[i] ?? '#8b5cf6', true)); };
    } catch (err: any) { toast.dismiss("prev"); toast.error(err.message); setPreviewingIdx(null); }
  };

  const handleReset = () => setStemConfigs(prev => prev.map(s => ({ ...s, pan: 0, volume: 1, included: true, solo: false })));

  const handleBounce = async () => {
    const included = stemConfigs.filter(s => s.included);
    if (!selectedAlbum || included.length === 0) { toast.error("Selecione ao menos uma faixa"); return; }
    if (!mixName.trim()) { toast.error("Dê um nome ao mix"); return; }
    setBouncing(true); stopPreview();
    try {
      toast.loading("Carregando faixas...", { id: "bounce" });
      const tmpCtx = new AudioContext();
      const bufs = await Promise.all(included.map(async sc => {
        let buf = previewBufsRef.current.get(sc.index);
        if (!buf) { const res = await fetch(`/api/multitracks/${selectedAlbum.id}/audio/${sc.index}`); buf = await tmpCtx.decodeAudioData(await res.arrayBuffer()); previewBufsRef.current.set(sc.index, buf); }
        return { sc, buffer: buf! };
      }));
      toast.loading("Processando mix...", { id: "bounce" });
      const maxDur = Math.max(...bufs.map(b => b.buffer.duration));
      const sr = bufs[0].buffer.sampleRate;
      const offCtx = new OfflineAudioContext(2, Math.ceil(maxDur * sr), sr);
      const masterGain = offCtx.createGain(); masterGain.gain.value = masterVol; masterGain.connect(offCtx.destination);
      bufs.forEach(({ sc, buffer }) => {
        const src = offCtx.createBufferSource(); src.buffer = buffer;
        const gain = offCtx.createGain(); gain.gain.value = sc.volume;
        const pan = offCtx.createStereoPanner(); pan.pan.value = sc.pan;
        src.connect(gain); gain.connect(pan); pan.connect(masterGain); src.start(0);
      });
      const rendered = await offCtx.startRendering(); tmpCtx.close();
      toast.loading("Gerando WAV...", { id: "bounce" });
      const wavBuffer = audioBufferToWav(rendered);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });

      // Salvar no banco primeiro para obter o ID
      const saveRes = await fetch("/api/custom-mix", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mixName, albumId: selectedAlbum.id, config: { stems: stemConfigs, preset: selectedPreset }, durationSec: maxDur }) });
      const sd = await saveRes.json();
      if (!saveRes.ok) { toast.dismiss("bounce"); toast.error(sd.message || sd.error); return; }

      const mixId = sd.mix.id;

      // Upload do WAV para o R2
      try {
        toast.loading("Salvando no servidor...", { id: "bounce" });
        const urlRes = await fetch("/api/custom-mix/upload-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mixId }),
        });
        if (urlRes.ok) {
          const { uploadUrl, fileKey } = await urlRes.json();
          await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "audio/wav" } });
          // Atualizar o mix com o fileKey
          await fetch(`/api/custom-mix?id=${mixId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileKey }),
          });
        }
      } catch { /* Upload R2 falhou — mix salvo sem fileKey, player vai rebounce */ }

      // Download local
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = dlUrl; a.download = `${mixName.replace(/[^a-z0-9]/gi,"_")}.wav`; a.click(); URL.revokeObjectURL(dlUrl);
      toast.dismiss("bounce"); toast.success("Mix criado e baixado!"); await loadData(); setSelectedAlbum(null);
    } catch (err: any) { toast.dismiss("bounce"); toast.error(err.message); }
    finally { setBouncing(false); }
  };

  const playMix = async (mix: CustomMix) => {
    // Parar play all se estiver rodando
    if (playingAll) stopPlayAll();

    if (playingMixId === mix.id && isPlaying) {
      sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
      clearInterval(playerIntervalRef.current);
      setIsPlaying(false); setPlayingMixId(null); setPlayerMix(null); setProgress(0); return;
    }
    // Parar qualquer mix anterior antes de iniciar novo
    sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
    clearInterval(playerIntervalRef.current); setIsPlaying(false);
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    setPlayerMix(mix); setPlayingMixId(mix.id);

    try {
      toast.loading("Carregando player...", { id: "player" });

      let buffer: AudioBuffer;

      if ((mix as any).fileKey) {
        // ✅ Mix salvo no R2 — carrega arquivo único com cache
        const url = `/api/custom-mix/${mix.id}/audio`;
        const ab = await fetchAudioCached(url);
        buffer = await ctx.decodeAudioData(ab);
        const src = ctx.createBufferSource(); src.buffer = buffer;
        src.connect(ctx.destination);
        const startAt = ctx.currentTime; startTimeRef.current = startAt;
        setDuration(buffer.duration); src.start(startAt);
        sourcesRef.current = [src]; setIsPlaying(true); toast.dismiss("player");
        playerIntervalRef.current = setInterval(() => {
          const el = ctx.currentTime - startAt; setProgress(Math.min(1, el / buffer.duration));
          if (el >= buffer.duration) { clearInterval(playerIntervalRef.current); setIsPlaying(false); setProgress(0); }
        }, 100);
        src.onended = () => { clearInterval(playerIntervalRef.current); setIsPlaying(false); setProgress(0); };
      } else {
        // ⚠️ Mix antigo sem fileKey — rebounce a partir dos stems (fallback)
        const included = (mix.config.stems as StemConfig[]).filter(s => s.included);
        const bufs = await Promise.all(included.map(async sc => {
          const url = `/api/multitracks/${mix.albumId}/audio/${sc.index}`;
          return { sc, buffer: await ctx.decodeAudioData(await fetchAudioCached(url)) };
        }));
        const maxDur = Math.max(...bufs.map(b => b.buffer.duration));
        setDuration(maxDur);
        const startAt = ctx.currentTime; startTimeRef.current = startAt;
        const srcs: AudioBufferSourceNode[] = [];
        bufs.forEach(({ sc, buf: _buf, ...rest }: any) => {
          const { buffer: buf, sc: s } = rest.sc ? { buffer: (rest as any).buffer, sc: (rest as any).sc } : { buffer: (rest as any).buffer, sc };
        });
        bufs.forEach(({ sc: stemCfg, buffer: stemBuf }) => {
          const src = ctx.createBufferSource();
          src.buffer = stemBuf;
          const gain = ctx.createGain(); gain.gain.value = stemCfg.volume;
          const pan = ctx.createStereoPanner(); pan.pan.value = stemCfg.pan;
          src.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
          src.start(startAt); srcs.push(src);
        });
        sourcesRef.current = srcs; setIsPlaying(true); toast.dismiss("player");
        playerIntervalRef.current = setInterval(() => {
          const el = ctx.currentTime - startAt; setProgress(Math.min(1, el / maxDur));
          if (el >= maxDur) { clearInterval(playerIntervalRef.current); setIsPlaying(false); setProgress(0); }
        }, 200);
      }
    } catch (err: any) { toast.dismiss("player"); toast.error(err.message); }
  };

  const deleteMix = async (id: string) => {
    if (!window.confirm("Remover este mix?")) return;
    try {
      const res = await fetch(`/api/custom-mix?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || "Erro ao remover"); return; }
      setMixes(prev => prev.filter(m => m.id !== id));
      if (playingMixId === id) {
        sourcesRef.current.forEach(s => { try { s.stop(); } catch {} });
        setIsPlaying(false); setPlayingMixId(null); setPlayerMix(null);
      }
      toast.success("Mix removido");
    } catch (err: any) { toast.error("Erro ao remover: " + err.message); }
  };

  const downloadMix = async (mix: CustomMix) => {
    const included = (mix.config.stems as StemConfig[]).filter(s => s.included);
    toast.loading("Preparando...", { id: "dl" });
    try {
      const tmpCtx = new AudioContext();
      const bufs = await Promise.all(included.map(async sc => { const res = await fetch(`/api/multitracks/${mix.albumId}/audio/${sc.index}`); return { sc, buffer: await tmpCtx.decodeAudioData(await res.arrayBuffer()) }; }));
      const maxDur = Math.max(...bufs.map(b => b.buffer.duration)); const sr = bufs[0].buffer.sampleRate;
      const offCtx = new OfflineAudioContext(2, Math.ceil(maxDur*sr), sr);
      bufs.forEach(({ sc, buffer }) => { const src=offCtx.createBufferSource(); src.buffer=buffer; const g=offCtx.createGain(); g.gain.value=sc.volume; const p=offCtx.createStereoPanner(); p.pan.value=sc.pan; src.connect(g); g.connect(p); p.connect(offCtx.destination); src.start(0); });
      const rendered = await offCtx.startRendering(); tmpCtx.close();
      const blob = new Blob([audioBufferToWav(rendered)], { type: "audio/wav" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`${mix.name.replace(/[^a-z0-9]/gi,"_")}.wav`; a.click(); URL.revokeObjectURL(url);
      toast.dismiss("dl"); toast.success("Download iniciado!");
    } catch (err: any) { toast.dismiss("dl"); toast.error(err.message); }
  };

  const hasSolo = stemConfigs.some(s => s.solo);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (blockedByPermission) return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
      <div className="flex justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Lock className="h-8 w-8 text-primary" /></div></div>
      <div>
        <h1 className="text-2xl font-bold mb-2">Custom Mix</h1>
        <p className="text-muted-foreground">Você não tem permissão para acessar o Custom Mix. Fale com o líder do seu ministério.</p>
      </div>
    </div>
  );

  if (blocked || quota.limit === 0) return (
    <div className="max-w-lg mx-auto mt-16 text-center space-y-6">
      <div className="flex justify-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Lock className="h-8 w-8 text-primary" /></div></div>
      <div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary flex items-center gap-1 justify-center w-fit mx-auto mb-3"><Sparkles className="h-3 w-3" /> Premium</span>
        <h1 className="text-2xl font-bold mb-2">Custom Mix</h1>
        <p className="text-muted-foreground">Disponível nos planos <strong>Avançado</strong> (10/mês) e <strong>Igreja</strong> (20/mês).</p>
      </div>
      <Button onClick={() => router.push("/planos")}><ArrowLeft className="h-4 w-4 mr-2 rotate-180" />Ver planos</Button>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Sliders className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Custom Mix</h1>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" />NOVO</span>
            </div>
            <p className="text-sm text-muted-foreground">Mixagens personalizadas das suas multitracks</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2">
          <Sliders className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Mixes este mês</p>
            <p className="text-sm font-semibold"><span className={cn(quota.remaining === 0 ? "text-red-400" : "text-primary")}>{quota.used}</span><span className="text-muted-foreground">/{quota.limit}</span></p>
          </div>
        </div>
      </div>

      {/* Seleção de álbum */}
      {!selectedAlbum ? (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-primary" />Criar novo mix</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <input
                type="text"
                placeholder="Buscar multitrack..."
                value={albumSearch}
                onChange={e => setAlbumSearch(e.target.value)}
                className="h-8 flex-1 min-w-[160px] rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => setFilterRentedMix(v => !v)}
                className={cn(
                  "h-8 flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-all whitespace-nowrap",
                  filterRentedMix
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Só alugadas
              </button>
            </div>
            {albums.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma multitrack disponível.</p>
              : (() => {
                  const filtered = albums.filter(a =>
                    (!albumSearch || a.title.toLowerCase().includes(albumSearch.toLowerCase()) || a.artist.toLowerCase().includes(albumSearch.toLowerCase())) &&
                    (!filterRentedMix || (a as any).rented)
                  );
                  return filtered.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma multitrack encontrada.</p>
                    : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {filtered.map(album => (
                    <button key={album.id} onClick={() => selectAlbum(album)} className="flex flex-col rounded-xl border border-border hover:border-primary/40 overflow-hidden transition-all text-left">
                      <div className="aspect-square bg-muted">{album.coverUrl ? <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center"><Music2 className="h-8 w-8 text-muted-foreground/20"/></div>}</div>
                      <div className="p-2"><p className="text-xs font-semibold truncate">{album.title}</p><p className="text-[10px] text-muted-foreground truncate">{album.artist}</p></div>
                    </button>
                  ))}
                </div>;
                })()}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedAlbum.coverUrl && <img src={selectedAlbum.coverUrl} alt="" className="h-10 w-10 rounded-lg object-cover"/>}
                <div><CardTitle className="text-base">{selectedAlbum.title}</CardTitle><p className="text-xs text-muted-foreground">{selectedAlbum.artist}</p></div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedAlbum(null); stopPreview(); }}><ArrowLeft className="h-4 w-4 mr-1"/>Trocar</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Nome */}
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome do mix</label><Input value={mixName} onChange={e => setMixName(e.target.value)} placeholder="Ex: Tudo é Perda — Ensaio"/></div>

            {/* Presets */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Preset rápido</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => applyPreset(p.key)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", selectedPreset === p.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>{p.label}</button>
                ))}
                <button onClick={handleReset} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"><RotateCcw className="h-3 w-3"/>Reset</button>
              </div>
            </div>

            {/* Mixer */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-muted-foreground">Mixer</label>
                  {/* Play All button */}
                  <button
                    onClick={togglePlayAll}
                    disabled={loadingAll || stemConfigs.length === 0}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                      playingAll
                        ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
                      (loadingAll || stemConfigs.length === 0) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {loadingAll
                      ? <><Loader2 className="h-3 w-3 animate-spin" />Carregando...</>
                      : playingAll
                      ? <><Pause className="h-3 w-3" />Parar preview</>
                      : <><Play className="h-3 w-3" />Preview do mix</>}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Master</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={1} step={0.01} value={masterVol} onChange={e => setMasterVol(Number(e.target.value))} className="w-20 accent-primary h-1"/>
                    <span className="text-xs font-semibold tabular-nums text-primary w-8">{Math.round(masterVol*100)}%</span>
                  </div>
                </div>
              </div>
              {/* Progress bar do Play All */}
              {playingAll && (
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-100" style={{ width: `${playAllProgress * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {Math.floor(playAllProgress * playAllDuration / 60)}:{String(Math.floor((playAllProgress * playAllDuration) % 60)).padStart(2, "0")} / {Math.floor(playAllDuration / 60)}:{String(Math.floor(playAllDuration % 60)).padStart(2, "0")}
                  </span>
                </div>
              )}

              {loadingStems ? (
                <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando faixas...</div>
              ) : stemConfigs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma faixa.</p>
              ) : (
                <div className="rounded-xl border border-white/8 bg-[#090910] p-4 overflow-x-auto">
                  <div className="flex gap-2" style={{ minWidth: stemConfigs.length > 6 ? stemConfigs.length * 82 : "100%" }}>
                    {stemConfigs.map((sc, i) => (
                      <div key={i} className="flex-1" style={{ minWidth: 72, maxWidth: 96 }}>
                        <MixerChannel
                          sc={sc} idx={i} color={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
                          vuBarRef={el => {
                            vuBarRefs.current[i] = el;
                            vuColors.current[i] = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
                          }}
                          onChange={u => updateStem(i, u)}
                          onPreview={() => previewStem(sc)}
                          previewing={previewingIdx === sc.index}
                          hasSolo={hasSolo}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-white/20 mt-3 text-center">M=mute · S=solo · ▶=prévia · arraste fader/knob · duplo clique=reset</p>
                </div>
              )}
            </div>

            <Button onClick={handleBounce} disabled={bouncing || quota.remaining === 0 || stemConfigs.length === 0} className="w-full" size="lg">
              {bouncing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Processando...</> : <><CheckCircle2 className="mr-2 h-4 w-4"/>Criar Mix e Baixar WAV</>}
            </Button>
            {quota.remaining === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Cota mensal esgotada</p>
                <p className="text-xs text-muted-foreground text-center">Você usou todos os {quota.limit} Custom Mix deste mês.</p>
                <Button size="sm" variant="outline" onClick={addExtraToCart} className="border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Comprar mix avulso — R$ 9,90
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mixes salvos */}
      {mixes.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">Seus mixes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mixes.map(mix => (
              <div key={mix.id} className="space-y-2">
                <MixCard mix={mix} onPlay={playMix} onDelete={deleteMix} isPlaying={playingMixId === mix.id && isPlaying}/>
                <Button variant="outline" size="sm" className="w-full" onClick={() => downloadMix(mix)}><Download className="h-3.5 w-3.5 mr-1.5"/>Download WAV</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player bar */}
      {playerMix && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3 flex items-center gap-4">
          <button onClick={() => playMix(playerMix)} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {isPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{playerMix.name}</p>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-200" style={{ width: `${progress*100}%` }}/></div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
            {duration > 0 ? `${Math.floor(progress*duration/60)}:${String(Math.floor((progress*duration)%60)).padStart(2,"0")} / ${Math.floor(duration/60)}:${String(Math.floor(duration%60)).padStart(2,"0")}` : "--:--"}
          </span>
        </div>
      )}
    </div>
  );
}
