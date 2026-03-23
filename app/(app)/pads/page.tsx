"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Grid3x3, Loader2, Usb, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Pad {
  id: string; boardId: string; name: string; position: number;
  type: "HOLD" | "LOOP" | "ONE_SHOT"; audioUrl: string | null;
  color: string; volume: number; midiNote: number | null;
  keyboardKey: string | null; loopSync: boolean;
}
interface PadBoard {
  id: string; name: string; bpm: number | null; musicalKey: string | null;
  color: string; cols: number; rows: number; pads: Pad[];
}

// Knob SVG rotativo
function Knob({ value, min, max, onChange, color = "#8B5CF6", size = 44, label }: {
  value: number; min: number; max: number; label: string;
  onChange: (v: number) => void; color?: string; size?: number;
}) {
  const pct = (value - min) / (max - min);
  const angle = -140 + pct * 280;
  const rad = (angle * Math.PI) / 180;
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const dotX = cx + r * 0.7 * Math.cos(rad);
  const dotY = cy + r * 0.7 * Math.sin(rad);
  const startRad = (-140 * Math.PI) / 180;
  const endRad = rad;
  const largeArc = Math.abs(angle - (-140)) > 180 ? 1 : 0;
  const arcStart = { x: cx + r * Math.cos(startRad), y: cy + r * Math.sin(startRad) };
  const arcEnd = { x: cx + r * Math.cos(endRad), y: cy + r * Math.sin(endRad) };

  const startY = useRef(0);
  const startVal = useRef(value);
  const dragging = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    const range = max - min;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = (startY.current - ev.clientY) / 120 * range;
      onChange(Math.max(min, Math.min(max, startVal.current + delta)));
    };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const onDblClick = (e: React.MouseEvent) => { e.stopPropagation(); onChange((max + min) / 2); };

  const displayVal = label === "Pitch" ? (value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0))
    : label === "Vol" ? `${Math.round(value * 100)}%`
    : `${Math.round(pct * 100)}%`;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none" onMouseDown={onMouseDown} onDoubleClick={onDblClick}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="cursor-ns-resize">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={size * 0.07} strokeLinecap="round"
          strokeDasharray={`${r * 2.44 * 280 / 360} ${r * 2 * Math.PI}`} strokeDashoffset={-r * 2 * Math.PI * 40 / 360}
          transform={`rotate(-90 ${cx} ${cy})`} />
        {pct > 0 && (
          <path d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`}
            fill="none" stroke={color} strokeWidth={size * 0.07} strokeLinecap="round" />
        )}
        <circle cx={cx} cy={cy} r={r * 0.6} fill="#1a1f2e" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <circle cx={dotX} cy={dotY} r={size * 0.055} fill={color} />
      </svg>
      <span className="text-[8px] text-muted-foreground/60 tabular-nums leading-none">{displayVal}</span>
      <span className="text-[8px] text-muted-foreground/40 leading-none">{label}</span>
    </div>
  );
}

// Fader vertical
function Fader({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const getVal = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return value;
    return Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
  };

  return (
    <div className="flex flex-col items-center gap-1 h-20">
      <div ref={trackRef} className="relative w-1.5 flex-1 rounded-full bg-white/5 cursor-pointer"
        onMouseDown={e => {
          e.preventDefault(); e.stopPropagation();
          dragging.current = true;
          onChange(getVal(e.clientY));
          const onMove = (ev: MouseEvent) => { if (dragging.current) onChange(getVal(ev.clientY)); };
          const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}>
        <div className="absolute bottom-0 left-0 right-0 rounded-full transition-all" style={{ height: `${value * 100}%`, backgroundColor: color + "80" }} />
        <div className="absolute left-1/2 -translate-x-1/2 w-4 h-2 rounded-sm bg-white/80 shadow-lg cursor-ns-resize"
          style={{ bottom: `calc(${value * 100}% - 4px)` }} />
      </div>
      <span className="text-[8px] text-muted-foreground/50 tabular-nums">{Math.round(value * 100)}</span>
    </div>
  );
}

export default function PadsPage() {
  const { data: session, status } = useSession() || {};
  const [boards, setBoards] = useState<PadBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PadBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [midiDevice, setMidiDevice] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState(false);
  const [showBoardPicker, setShowBoardPicker] = useState(false);

  // Controles por pad: vol, cutoff, reverb, pitch, mute
  const [padControls, setPadControls] = useState<Record<number, {
    volume: number; cutoff: number; reverb: number; pitch: number; mute: boolean;
  }>>({});
  const [globalPitch, setGlobalPitch] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Record<number, AudioBuffer>>({});
  const sourceNodesRef = useRef<Record<number, AudioBufferSourceNode>>({});
  const gainNodesRef = useRef<Record<number, GainNode>>({});
  const filterNodesRef = useRef<Record<number, BiquadFilterNode>>({});
  const reverbNodesRef = useRef<Record<number, ConvolverNode | GainNode>>({});
  const reverbGainRef = useRef<Record<number, GainNode>>({});
  const midiRef = useRef<MIDIAccess | null>(null);
  const activeBoardRef = useRef<PadBoard | null>(null);
  const padControlsRef = useRef(padControls);
  const globalPitchRef = useRef(globalPitch);

  useEffect(() => { activeBoardRef.current = activeBoard; }, [activeBoard]);
  useEffect(() => { padControlsRef.current = padControls; }, [padControls]);
  useEffect(() => { globalPitchRef.current = globalPitch; }, [globalPitch]);

  const getControl = useCallback((pos: number, pad?: Pad) => ({
    volume: padControls[pos]?.volume ?? pad?.volume ?? 1,
    cutoff: padControls[pos]?.cutoff ?? 1,
    reverb: padControls[pos]?.reverb ?? 0,
    pitch: padControls[pos]?.pitch ?? 0,
    mute: padControls[pos]?.mute ?? false,
  }), [padControls]);

  const updateControl = (pos: number, key: string, val: number | boolean) => {
    setPadControls(prev => ({ ...prev, [pos]: { ...getControl(pos), [key]: val } }));
    // Atualizar nó de áudio em tempo real
    if (key === "volume" && gainNodesRef.current[pos]) {
      gainNodesRef.current[pos].gain.value = (val as number);
    }
    if (key === "cutoff" && filterNodesRef.current[pos]) {
      const freq = 200 + (val as number) * 18000;
      filterNodesRef.current[pos].frequency.value = freq;
    }
    if (key === "reverb" && reverbGainRef.current[pos]) {
      reverbGainRef.current[pos].gain.value = (val as number);
    }
    if (key === "pitch" && sourceNodesRef.current[pos]) {
      sourceNodesRef.current[pos].playbackRate.value = Math.pow(2, (globalPitchRef.current + (val as number)) / 12);
    }
    if (key === "mute" && gainNodesRef.current[pos]) {
      gainNodesRef.current[pos].gain.value = val ? 0 : (padControlsRef.current[pos]?.volume ?? 1);
    }
  };

  // Criar impulso de reverb simples
  const createReverbImpulse = (ctx: AudioContext, duration = 2, decay = 2) => {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const channel = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/pads").then(r => r.json()).then(d => {
      setBoards(d.boards || []);
      if (d.boards?.length > 0) setActiveBoard(d.boards[0]);
    }).finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (!activeBoard) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    buffersRef.current = {};

    activeBoard.pads.forEach(pad => {
      if (!pad.audioUrl) return;
      fetch(pad.audioUrl)
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => { buffersRef.current[pad.position] = decoded; })
        .catch(err => console.warn(`[pads] Falhou carregar pad ${pad.position}:`, err));
    });
  }, [activeBoard?.id]);

  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiSupported(false); return; }
    setMidiSupported(true);
    navigator.requestMIDIAccess().then(midi => {
      midiRef.current = midi;
      connectMidi(midi);
      midi.onstatechange = () => connectMidi(midi);
    }).catch(() => {});
  }, []);

  const connectMidi = (midi: MIDIAccess) => {
    const inputs = Array.from(midi.inputs.values());
    if (!inputs.length) { setMidiDevice(null); return; }
    setMidiDevice(inputs[0].name || "MIDI");
    inputs.forEach(inp => { inp.onmidimessage = handleMidi; });
  };

  const handleMidi = useCallback((e: MIDIMessageEvent) => {
    const [s, note, vel] = e.data;
    const cmd = s & 0xf0;
    const isOn = cmd === 0x90 && vel > 0;
    const isOff = cmd === 0x80 || (cmd === 0x90 && vel === 0);
    const isCC = cmd === 0xb0;
    const board = activeBoardRef.current;
    if (!board) return;
    if (isCC) {
      const pad = board.pads.find(p => p.midiNote === note);
      if (pad) updateControl(pad.position, "volume", vel / 127);
      return;
    }
    const pad = board.pads.find(p => p.midiNote === note);
    if (!pad) return;
    if (isOn) triggerPad(pad, "on");
    if (isOff && pad.type === "HOLD") triggerPad(pad, "off");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      const board = activeBoardRef.current;
      if (!board) return;
      const pad = board.pads.find(p => p.keyboardKey?.toLowerCase() === e.key.toLowerCase());
      if (!pad) return;
      if (e.type === "keydown" && !e.repeat) triggerPad(pad, "on");
      if (e.type === "keyup" && pad.type === "HOLD") triggerPad(pad, "off");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  const triggerPad = useCallback((pad: Pad, action: "on" | "off") => {
    if (!pad.audioUrl) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const buf = buffersRef.current[pad.position];
    if (!buf) { toast.error(`Áudio do pad "${pad.name}" ainda carregando...`); return; }
    const ctrl = padControlsRef.current[pad.position];
    if (ctrl?.mute) return;

    if (pad.type === "LOOP") {
      if (sourceNodesRef.current[pad.position]) {
        try { sourceNodesRef.current[pad.position].stop(); } catch {}
        delete sourceNodesRef.current[pad.position];
        setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; });
      } else {
        playPad(pad, buf, ctx, true);
        setActivePads(prev => new Set(prev).add(pad.position));
      }
    } else if (pad.type === "HOLD") {
      if (action === "on") { playPad(pad, buf, ctx, true); setActivePads(prev => new Set(prev).add(pad.position)); }
      else {
        try { sourceNodesRef.current[pad.position]?.stop(); } catch {}
        delete sourceNodesRef.current[pad.position];
        setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; });
      }
    } else {
      playPad(pad, buf, ctx, false);
      setActivePads(prev => new Set(prev).add(pad.position));
      setTimeout(() => setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; }), buf.duration * 1000);
    }
  }, []);

  const playPad = (pad: Pad, buf: AudioBuffer, ctx: AudioContext, loop: boolean) => {
    try { sourceNodesRef.current[pad.position]?.stop(); } catch {}
    const ctrl = padControlsRef.current[pad.position];
    const vol = ctrl?.volume ?? pad.volume ?? 1;
    const cutoff = ctrl?.cutoff ?? 1;
    const reverb = ctrl?.reverb ?? 0;
    const pitch = ctrl?.pitch ?? 0;

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = loop;
    source.playbackRate.value = Math.pow(2, (globalPitchRef.current + pitch) / 12);

    // Gain
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gainNodesRef.current[pad.position] = gain;

    // Filter (cutoff)
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200 + cutoff * 18000;
    filter.Q.value = 1;
    filterNodesRef.current[pad.position] = filter;

    // Reverb (convolver)
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = reverb;
    reverbGainRef.current[pad.position] = reverbGain;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;

    // Chain: source → filter → gain → dry + reverb → destination
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dryGain);
    gain.connect(convolver);
    convolver.connect(reverbGain);
    dryGain.connect(ctx.destination);
    reverbGain.connect(ctx.destination);

    source.start();
    sourceNodesRef.current[pad.position] = source;
    source.onended = () => { if (!loop) delete sourceNodesRef.current[pad.position]; };
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const board = activeBoard;
  const totalPads = board ? board.cols * board.rows : 0;
  const sel = selectedPad !== null ? board?.pads.find(p => p.position === selectedPad) : null;
  const selCtrl = selectedPad !== null ? getControl(selectedPad, sel ?? undefined) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background overflow-hidden">

      {/* Header compacto */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 flex-shrink-0">
        <Grid3x3 className="h-5 w-5 text-primary flex-shrink-0" />

        {/* Board picker */}
        {boards.length > 0 ? (
          <div className="relative">
            <button onClick={() => setShowBoardPicker(v => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium hover:bg-muted/80">
              <span style={{ color: board?.color }}>{board?.name || "Selecionar board"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {showBoardPicker && (
              <div className="absolute top-full left-0 mt-1 z-50 rounded-xl border border-border bg-popover p-1 shadow-xl min-w-[160px]">
                {boards.map(b => (
                  <button key={b.id} onClick={() => { setActiveBoard(b); setShowBoardPicker(false); setPadControls({}); setActivePads(new Set()); setSelectedPad(null); }}
                    className={cn("w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-muted", b.id === board?.id && "bg-muted")}>
                    <span style={{ color: b.color }}>{b.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Nenhum board disponível</span>
        )}

        {board?.bpm && <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono"><span className="text-primary font-bold">{board.bpm}</span> BPM</span>}
        {board?.musicalKey && <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-mono font-bold">{board.musicalKey}</span>}

        <div className="ml-auto flex items-center gap-3">
          {/* Pitch global */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <span className="text-[10px] text-muted-foreground">Tom</span>
            <button onClick={() => setGlobalPitch(v => Math.max(-6, v - 1))} className="w-5 h-5 rounded bg-muted text-xs text-muted-foreground hover:text-foreground flex items-center justify-center">−</button>
            <span className={cn("text-xs font-bold tabular-nums w-6 text-center", globalPitch > 0 ? "text-emerald-400" : globalPitch < 0 ? "text-amber-400" : "text-muted-foreground")}>
              {globalPitch > 0 ? `+${globalPitch}` : globalPitch}
            </span>
            <button onClick={() => setGlobalPitch(v => Math.min(6, v + 1))} className="w-5 h-5 rounded bg-muted text-xs text-muted-foreground hover:text-foreground flex items-center justify-center">+</button>
          </div>

          {/* MIDI status */}
          <div className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px]",
            midiDevice ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground")}>
            <Usb className="h-3 w-3" />
            {midiDevice || (midiSupported ? "Sem MIDI" : "MIDI indisponível")}
          </div>
        </div>
      </div>

      {/* Grid de pads — área principal */}
      {board && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${board.cols}, 1fr)`, gridTemplateRows: `repeat(${board.rows}, 1fr)` }}>
            {Array.from({ length: totalPads }).map((_, pos) => {
              const pad = board.pads.find(p => p.position === pos);
              const isActive = activePads.has(pos);
              const isSelected = selectedPad === pos;
              const ctrl = getControl(pos, pad ?? undefined);
              const hasAudio = !!pad?.audioUrl;

              return (
                <button
                  key={pos}
                  onMouseDown={e => { e.preventDefault(); if (hasAudio && pad) triggerPad(pad, "on"); setSelectedPad(pos); }}
                  onMouseUp={() => pad?.type === "HOLD" && triggerPad(pad!, "off")}
                  onMouseLeave={() => pad?.type === "HOLD" && isActive && triggerPad(pad!, "off")}
                  onTouchStart={e => { e.preventDefault(); if (hasAudio && pad) { triggerPad(pad, "on"); setSelectedPad(pos); } }}
                  onTouchEnd={() => pad?.type === "HOLD" && triggerPad(pad!, "off")}
                  className={cn(
                    "relative rounded-2xl border-2 flex flex-col items-center justify-center transition-all select-none min-h-[80px]",
                    hasAudio ? "cursor-pointer" : "opacity-15 cursor-default border-dashed border-white/10",
                    isActive && "scale-95",
                    isSelected && hasAudio && "ring-2 ring-white/30 ring-offset-1 ring-offset-background",
                    ctrl.mute && "opacity-30",
                  )}
                  style={hasAudio ? {
                    backgroundColor: isActive ? pad!.color + "40" : pad!.color + "12",
                    borderColor: isSelected ? pad!.color : isActive ? pad!.color + "80" : pad!.color + "35",
                    boxShadow: isActive ? `0 0 24px ${pad!.color}50, inset 0 0 20px ${pad!.color}15` : "none",
                  } : {}}
                >
                  {hasAudio && (
                    <>
                      {/* Tipo */}
                      <span className="absolute top-2 right-2 text-[9px] font-bold opacity-40" style={{ color: pad!.color }}>
                        {pad!.type === "LOOP" ? "∞" : pad!.type === "HOLD" ? "⏥" : "▶"}
                      </span>
                      {/* Atalhos */}
                      {(pad!.keyboardKey || pad!.midiNote != null) && (
                        <div className="absolute top-2 left-2 flex gap-0.5">
                          {pad!.keyboardKey && <span className="text-[8px] font-bold uppercase px-1 rounded bg-black/40" style={{ color: pad!.color }}>{pad!.keyboardKey}</span>}
                          {pad!.midiNote != null && <span className="text-[8px] font-bold px-1 rounded bg-black/40" style={{ color: pad!.color }}>{pad!.midiNote}</span>}
                        </div>
                      )}
                      {/* Mute indicator */}
                      {ctrl.mute && <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-400">MUTE</span>}
                      {/* Pulso animado */}
                      {isActive && (
                        <div className="absolute inset-2 rounded-xl animate-pulse opacity-20" style={{ backgroundColor: pad!.color }} />
                      )}
                      {/* Nome */}
                      <div className="h-3 w-3 rounded-full mb-1.5" style={{ backgroundColor: pad!.color, opacity: isActive ? 1 : 0.6 }} />
                      <p className="text-xs font-semibold px-2 text-center leading-tight" style={{ color: pad!.color }}>{pad!.name}</p>
                    </>
                  )}
                  {!hasAudio && <span className="text-[10px] text-white/15">{pos + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mixer fixo na parte inferior */}
      {board && selectedPad !== null && sel && (
        <div className="flex-shrink-0 border-t border-border/50 bg-card/80 backdrop-blur px-5 py-3">
          <div className="flex items-center gap-6">
            {/* Nome do pad selecionado */}
            <div className="w-24 flex-shrink-0">
              <div className="h-2 w-2 rounded-full mb-1" style={{ backgroundColor: sel.color }} />
              <p className="text-xs font-semibold truncate" style={{ color: sel.color }}>{sel.name}</p>
              <p className="text-[9px] text-muted-foreground">{sel.type === "LOOP" ? "Loop" : sel.type === "HOLD" ? "Hold" : "One Shot"}</p>
            </div>

            {/* Fader de volume */}
            <div className="flex flex-col items-center gap-1">
              <Fader value={selCtrl!.volume} color={sel.color}
                onChange={v => updateControl(selectedPad, "volume", v)} />
              <span className="text-[9px] text-muted-foreground">Vol</span>
            </div>

            <div className="w-px h-12 bg-border/50 flex-shrink-0" />

            {/* Knobs */}
            <div className="flex items-end gap-4">
              <Knob value={selCtrl!.cutoff} min={0} max={1} label="Cutoff" color={sel.color}
                onChange={v => updateControl(selectedPad, "cutoff", v)} />
              <Knob value={selCtrl!.reverb} min={0} max={1} label="Reverb" color="#06B6D4"
                onChange={v => updateControl(selectedPad, "reverb", v)} />
              <Knob value={selCtrl!.pitch} min={-6} max={6} label="Pitch" color="#F59E0B"
                onChange={v => updateControl(selectedPad, "pitch", Math.round(v))} />
            </div>

            <div className="w-px h-12 bg-border/50 flex-shrink-0" />

            {/* Mute */}
            <button
              onClick={() => updateControl(selectedPad, "mute", !selCtrl!.mute)}
              className={cn("rounded-xl px-4 py-2 text-xs font-bold transition-all",
                selCtrl!.mute ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
              MUTE
            </button>

            {/* Reset */}
            <button onClick={() => setPadControls(prev => { const n = { ...prev }; delete n[selectedPad]; return n; })}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground">
              Reset
            </button>

            <div className="ml-auto text-[10px] text-muted-foreground/30">
              Clique num pad para selecionar · Arraste knobs verticalmente · Duplo clique = reset
            </div>
          </div>
        </div>
      )}

      {/* Dica quando nenhum pad selecionado */}
      {board && selectedPad === null && (
        <div className="flex-shrink-0 border-t border-border/30 px-5 py-3 text-center text-[11px] text-muted-foreground/30">
          Clique num pad para disparar e ver os controles · Alt+Scroll = pitch individual
        </div>
      )}
    </div>
  );
}
