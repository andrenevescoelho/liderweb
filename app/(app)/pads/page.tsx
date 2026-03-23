"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Grid3x3, Loader2, Usb, Wifi, WifiOff, Volume2 } from "lucide-react";
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

export default function PadsPage() {
  const { data: session, status } = useSession() || {};
  const [boards, setBoards] = useState<PadBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PadBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [midiDevice, setMidiDevice] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Record<number, AudioBuffer>>({});
  const sourceNodesRef = useRef<Record<number, AudioBufferSourceNode>>({});
  const gainNodesRef = useRef<Record<number, GainNode>>({});
  const midiRef = useRef<MIDIAccess | null>(null);
  const activeBoardRef = useRef<PadBoard | null>(null);

  useEffect(() => { activeBoardRef.current = activeBoard; }, [activeBoard]);

  // Carregar boards
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/pads")
      .then(r => r.json())
      .then(d => {
        setBoards(d.boards || []);
        if (d.boards?.length > 0) setActiveBoard(d.boards[0]);
      })
      .finally(() => setLoading(false));
  }, [status]);

  // Pré-carregar áudios quando board muda
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
        .catch(() => {});
    });
  }, [activeBoard?.id]);

  // Inicializar MIDI
  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiSupported(false); return; }
    setMidiSupported(true);
    navigator.requestMIDIAccess().then(midi => {
      midiRef.current = midi;
      connectMidiDevices(midi);
      midi.onstatechange = () => connectMidiDevices(midi);
    }).catch(() => toast.error("MIDI não permitido. Verifique as permissões do navegador."));
  }, []);

  const connectMidiDevices = (midi: MIDIAccess) => {
    const inputs = Array.from(midi.inputs.values());
    if (inputs.length === 0) { setMidiDevice(null); return; }
    const input = inputs[0];
    setMidiDevice(input.name || "Dispositivo MIDI");
    input.onmidimessage = handleMidiMessage;
    inputs.slice(1).forEach(inp => { inp.onmidimessage = handleMidiMessage; });
  };

  const handleMidiMessage = useCallback((e: MIDIMessageEvent) => {
    const [status, note, velocity] = e.data;
    const cmd = status & 0xf0;
    const isNoteOn = cmd === 0x90 && velocity > 0;
    const isNoteOff = cmd === 0x80 || (cmd === 0x90 && velocity === 0);
    const isCC = cmd === 0xb0;

    const board = activeBoardRef.current;
    if (!board) return;

    if (isCC) {
      // CC: controlar volume de pad pelo knob
      const pad = board.pads.find(p => p.midiNote === note);
      if (pad) {
        const vol = velocity / 127;
        const gain = gainNodesRef.current[pad.position];
        if (gain) gain.gain.value = vol;
      }
      return;
    }

    const pad = board.pads.find(p => p.midiNote === note);
    if (!pad) return;

    if (isNoteOn) triggerPad(pad, "on");
    if (isNoteOff && pad.type === "HOLD") triggerPad(pad, "off");
  }, []);

  // Atalhos de teclado
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
    if (!buf) return;

    if (pad.type === "LOOP") {
      // Toggle
      if (sourceNodesRef.current[pad.position]) {
        try { sourceNodesRef.current[pad.position].stop(); } catch {}
        delete sourceNodesRef.current[pad.position];
        setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; });
      } else {
        playPad(pad, buf, ctx, true);
        setActivePads(prev => new Set(prev).add(pad.position));
      }
    } else if (pad.type === "HOLD") {
      if (action === "on") {
        playPad(pad, buf, ctx, true);
        setActivePads(prev => new Set(prev).add(pad.position));
      } else {
        try { sourceNodesRef.current[pad.position]?.stop(); } catch {}
        delete sourceNodesRef.current[pad.position];
        setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; });
      }
    } else {
      // ONE_SHOT
      playPad(pad, buf, ctx, false);
      setActivePads(prev => new Set(prev).add(pad.position));
      setTimeout(() => setActivePads(prev => { const n = new Set(prev); n.delete(pad.position); return n; }), buf.duration * 1000);
    }
  }, []);

  const playPad = (pad: Pad, buf: AudioBuffer, ctx: AudioContext, loop: boolean) => {
    try { sourceNodesRef.current[pad.position]?.stop(); } catch {}
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = loop;
    const gain = gainNodesRef.current[pad.position] || ctx.createGain();
    gainNodesRef.current[pad.position] = gain;
    gain.gain.value = pad.volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    sourceNodesRef.current[pad.position] = source;
    source.onended = () => {
      if (!loop) { delete sourceNodesRef.current[pad.position]; }
    };
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Grid3x3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Pads & Loops</h1>
            <p className="text-xs text-muted-foreground">Disparo ao vivo de pads e efeitos</p>
          </div>
        </div>
        {/* Status MIDI */}
        <div className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
          midiDevice ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border text-muted-foreground")}>
          <Usb className="h-3.5 w-3.5" />
          {midiDevice ? midiDevice : midiSupported ? "Nenhum dispositivo MIDI" : "MIDI não suportado"}
        </div>
      </div>

      {/* Seletor de boards */}
      {boards.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {boards.map(b => (
            <button key={b.id} onClick={() => setActiveBoard(b)}
              className={cn("rounded-xl border px-4 py-2 text-sm font-medium transition-all",
                activeBoard?.id === b.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {!activeBoard ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Grid3x3 className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">Nenhum board disponível.</p>
        </div>
      ) : (
        <>
          {/* Info do board */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {activeBoard.bpm && <span className="rounded bg-muted px-2 py-0.5 font-mono"><span className="text-primary font-bold">{activeBoard.bpm}</span> BPM</span>}
            {activeBoard.musicalKey && <span className="rounded bg-muted px-2 py-0.5 font-mono font-bold text-foreground">{activeBoard.musicalKey}</span>}
            <span>{activeBoard.cols}×{activeBoard.rows} · {activeBoard.pads.filter(p => p.audioUrl).length} pads carregados</span>
          </div>

          {/* Grid de pads */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${activeBoard.cols}, 1fr)` }}>
            {Array.from({ length: activeBoard.cols * activeBoard.rows }).map((_, pos) => {
              const pad = activeBoard.pads.find(p => p.position === pos);
              const isActive = activePads.has(pos);
              const hasAudio = !!pad?.audioUrl;

              return (
                <button
                  key={pos}
                  disabled={!hasAudio}
                  onMouseDown={() => pad && triggerPad(pad, "on")}
                  onMouseUp={() => pad?.type === "HOLD" && triggerPad(pad, "off")}
                  onMouseLeave={() => pad?.type === "HOLD" && isActive && triggerPad(pad, "off")}
                  onTouchStart={e => { e.preventDefault(); pad && triggerPad(pad, "on"); }}
                  onTouchEnd={() => pad?.type === "HOLD" && triggerPad(pad, "off")}
                  className={cn(
                    "relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-3 text-center transition-all select-none",
                    hasAudio ? "cursor-pointer active:scale-95" : "opacity-20 cursor-not-allowed border-dashed border-border",
                    isActive && "scale-95 shadow-xl"
                  )}
                  style={hasAudio ? {
                    backgroundColor: isActive ? pad!.color + "50" : pad!.color + "15",
                    borderColor: isActive ? pad!.color : pad!.color + "50",
                    boxShadow: isActive ? `0 0 20px ${pad!.color}60` : "none",
                  } : {}}
                >
                  {hasAudio && (
                    <>
                      {/* Indicador de tipo */}
                      <div className="absolute top-2 right-2 text-[8px] font-bold opacity-50" style={{ color: pad!.color }}>
                        {pad!.type === "LOOP" ? "∞" : pad!.type === "HOLD" ? "⏥" : "▶"}
                      </div>
                      {/* Atalhos */}
                      {(pad!.keyboardKey || pad!.midiNote != null) && (
                        <div className="absolute top-2 left-2 flex gap-0.5">
                          {pad!.keyboardKey && <span className="text-[8px] font-bold uppercase px-1 rounded bg-black/30" style={{ color: pad!.color }}>{pad!.keyboardKey}</span>}
                          {pad!.midiNote != null && <span className="text-[8px] font-bold px-1 rounded bg-black/30" style={{ color: pad!.color }}>{pad!.midiNote}</span>}
                        </div>
                      )}
                      <div className="h-4 w-4 rounded-full mb-1.5 transition-transform" style={{ backgroundColor: pad!.color, transform: isActive ? "scale(1.3)" : "scale(1)" }} />
                      <p className="text-xs font-semibold leading-tight" style={{ color: isActive ? pad!.color : pad!.color + "cc" }}>{pad!.name}</p>
                    </>
                  )}
                  {!hasAudio && <span className="text-[10px] text-muted-foreground/30">{pos + 1}</span>}
                </button>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/50 pt-2">
            <span>▶ One Shot</span>
            <span>∞ Loop (toggle)</span>
            <span>⏥ Hold (segure)</span>
            <span className="ml-auto">Teclado, Mouse ou MIDI</span>
          </div>
        </>
      )}
    </div>
  );
}
