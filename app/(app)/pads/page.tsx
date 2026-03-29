"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Usb, Volume2, Volume1, Zap, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Pad {
  id: string; boardId: string; name: string; position: number;
  type: "HOLD"|"LOOP"|"ONE_SHOT"; audioUrl: string|null;
  color: string; volume: number; midiNote: number|null;
  keyboardKey: string|null; loopSync: boolean;
}
interface PadBoard {
  id: string; name: string; bpm: number|null; musicalKey: string|null;
  color: string; cols: number; rows: number; pads: Pad[];
}

const SEMITONES: Record<string,number> = {C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// Knob VST circular
function Knob({ value, min, max, onChange, color="#8B5CF6", label, size=56 }: {
  value:number; min:number; max:number; label:string;
  onChange:(v:number)=>void; color?:string; size?:number;
}) {
  const pct = (value-min)/(max-min);
  const angle = -135 + pct*270;
  const rad = (angle*Math.PI)/180;
  const cx=size/2, cy=size/2, r=size*0.37;
  const dotX=cx+r*0.68*Math.cos(rad), dotY=cy+r*0.68*Math.sin(rad);
  const startRad=(-135*Math.PI)/180;
  const asx=cx+r*Math.cos(startRad), asy=cy+r*Math.sin(startRad);
  const aex=cx+r*Math.cos(rad), aey=cy+r*Math.sin(rad);
  const largeArc=Math.abs(angle+135)>180?1:0;
  const dragging=useRef(false), startY=useRef(0), startVal=useRef(value);

  const onMD=(e:React.MouseEvent)=>{
    e.preventDefault(); e.stopPropagation();
    dragging.current=true; startY.current=e.clientY; startVal.current=value;
    const range=max-min;
    const onMove=(ev:MouseEvent)=>{ if(dragging.current) onChange(Math.max(min,Math.min(max,startVal.current+(startY.current-ev.clientY)/100*range))); };
    const onUp=()=>{ dragging.current=false; window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
  };

  return (
    <div className="flex flex-col items-center gap-1 select-none" onMouseDown={onMD} onDoubleClick={()=>onChange((max+min)/2)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="cursor-ns-resize">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.09} strokeLinecap="round"/>
        {pct>0.01&&<path d={`M ${asx} ${asy} A ${r} ${r} 0 ${largeArc} 1 ${aex} ${aey}`} fill="none" stroke={color} strokeWidth={size*0.09} strokeLinecap="round" opacity={0.9}/>}
        <circle cx={cx} cy={cy} r={r*0.58} fill="#0f1117" stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
        <circle cx={dotX} cy={dotY} r={size*0.055} fill={color}/>
        <circle cx={cx} cy={cy} r={r*0.22} fill={color} opacity={0.3}/>
      </svg>
      <span className="text-[9px] text-white/40 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// Waveform animada com visualizer
function MiniWaveform({ color, playing, intensity=0.5 }: { color:string; playing:boolean; intensity?:number }) {
  const bars = Array.from({length:40},(_,i)=>0.1+Math.abs(Math.sin(i*0.4+1.2)*Math.sin(i*0.15)*0.7));
  return (
    <div className="flex items-center gap-0.5 h-full w-full">
      {bars.map((h,i)=>(
        <div key={i} className="flex-1 rounded-full transition-all"
          style={{
            height:`${(playing ? h*intensity*1.4+0.1 : h*0.3)*100}%`,
            backgroundColor:color,
            opacity:playing?0.7:0.25,
            transition:`height ${0.1+Math.random()*0.2}s ease`,
          }}/>
      ))}
    </div>
  );
}

// Ícone do pad
function PadIcon({ name, color, size=40 }: { name:string; color:string; size?:number }) {
  const n=name.toLowerCase();
  const s=size;
  if(n.includes("warm")||n.includes("quente")) return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <circle cx="20" cy="24" r="12" fill={color+"20"} stroke={color} strokeWidth="1.5"/>
      <path d="M20 10 C20 10 15 17 15 21 C15 25 20 27 20 27 C20 27 25 25 25 21 C25 17 20 10 20 10Z" fill={color} opacity={0.85}/>
      <circle cx="20" cy="23" r="4" fill={color}/>
    </svg>
  );
  if(n.includes("cinema")||n.includes("epic")||n.includes("drama")) return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <path d="M4 30 Q12 16 20 14 Q28 16 36 30" fill="none" stroke={color} strokeWidth="1.5" opacity={0.5}/>
      <path d="M2 34 Q12 14 20 10 Q28 14 38 34" fill={color+"15"} stroke={color} strokeWidth="2"/>
      {[6,12,20,28,34].map((x,i)=><circle key={i} cx={x} cy={30-Math.abs(x-20)*0.3} r="1.5" fill={color}/>)}
    </svg>
  );
  if(n.includes("ambient")||n.includes("atmos")||n.includes("air")||n.includes("sky")) return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <ellipse cx="20" cy="26" rx="14" ry="7" fill={color+"20"} stroke={color} strokeWidth="1.5"/>
      <ellipse cx="15" cy="22" rx="9" ry="6" fill={color+"25"} stroke={color} strokeWidth="1.5"/>
      <ellipse cx="25" cy="20" rx="10" ry="7" fill={color+"30"} stroke={color} strokeWidth="1.5"/>
      <ellipse cx="20" cy="16" rx="8" ry="6" fill={color+"40"} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
  if(n.includes("piano")||n.includes("teclado")||n.includes("keys")) return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <rect x="4" y="14" width="32" height="20" rx="2" fill={color+"15"} stroke={color} strokeWidth="1.5"/>
      {[0,1,2,3,4].map(i=><line key={i} x1={10+i*5.5} y1="14" x2={10+i*5.5} y2="34" stroke={color} strokeWidth="1" opacity={0.4}/>)}
      {[0,1,3].map(i=><rect key={i} x={8+i*5.5+(i>1?5.5:0)} y="14" width="3.5" height="13" rx="1" fill={color} opacity={0.8}/>)}
    </svg>
  );
  if(n.includes("string")||n.includes("orquest")||n.includes("violin")) return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <path d="M20 6 Q28 14 28 20 Q28 30 20 34 Q12 30 12 20 Q12 14 20 6Z" fill={color+"20"} stroke={color} strokeWidth="1.5"/>
      <line x1="20" y1="8" x2="20" y2="32" stroke={color} strokeWidth="1.5"/>
      <line x1="14" y1="17" x2="26" y2="17" stroke={color} strokeWidth="1.5"/>
      <line x1="13" y1="24" x2="27" y2="24" stroke={color} strokeWidth="1.5"/>
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="14" fill={color+"15"} stroke={color} strokeWidth="1.5"/>
      <circle cx="20" cy="20" r="7" fill={color+"30"} stroke={color} strokeWidth="1"/>
      <circle cx="20" cy="20" r="3" fill={color}/>
    </svg>
  );
}

export default function PadsPage() {
  const { data: session, status } = useSession() || {};
  const [boards, setBoards] = useState<PadBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<PadBoard|null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPad, setCurrentPad] = useState<Pad|null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pitch, setPitch] = useState(0); // -12 a +12
  const [bpm, setBpm] = useState(70);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [intensity, setIntensity] = useState(0.7);
  const [atmosphere, setAtmosphere] = useState(0.3);
  const [fadeIn, setFadeIn] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [fadeDuration, setFadeDuration] = useState(2);
  const [modeCulto, setModeCulto] = useState(false);
  const [midiDevice, setMidiDevice] = useState<string|null>(null);

  const [fx, setFx] = useState({
    reverb: 0.4, delay: 0.0, filter: 1.0, shimmer: 0.0,
  });

  const audioCtxRef = useRef<AudioContext|null>(null);
  const buffersRef = useRef<Record<string,AudioBuffer>>({});
  const sourceRef = useRef<AudioBufferSourceNode|null>(null);
  const gainRef = useRef<GainNode|null>(null);
  const masterGainRef = useRef<GainNode|null>(null);
  const filterRef = useRef<BiquadFilterNode|null>(null);
  const reverbGainRef = useRef<GainNode|null>(null);
  const delayGainRef = useRef<GainNode|null>(null);
  const reverbRef = useRef<ConvolverNode|null>(null);
  const delayRef = useRef<DelayNode|null>(null);
  const pitchRef = useRef(0);
  const fadeInRef = useRef(false);
  const fadeOutRef = useRef(false);
  const fadeDurRef = useRef(2);
  const fxRef = useRef(fx);
  const masterVolRef = useRef(0.8);

  useEffect(()=>{pitchRef.current=pitch; if(sourceRef.current) sourceRef.current.playbackRate.value=Math.pow(2,pitch/12);},[pitch]);
  useEffect(()=>{fadeInRef.current=fadeIn;},[fadeIn]);
  useEffect(()=>{fadeOutRef.current=fadeOut;},[fadeOut]);
  useEffect(()=>{fadeDurRef.current=fadeDuration;},[fadeDuration]);
  useEffect(()=>{fxRef.current=fx; applyFx(fx);},[fx]);
  useEffect(()=>{masterVolRef.current=masterVolume; if(masterGainRef.current) masterGainRef.current.gain.value=masterVolume;},[masterVolume]);

  const applyFx=(f:typeof fx)=>{
    if(reverbGainRef.current) reverbGainRef.current.gain.value=f.reverb;
    if(delayGainRef.current) delayGainRef.current.gain.value=f.delay;
    if(filterRef.current) filterRef.current.frequency.value=200+f.filter*15800;
  };

  const createReverbBuf=(ctx:AudioContext)=>{
    const buf=ctx.createBuffer(2,ctx.sampleRate*4,ctx.sampleRate);
    for(let c=0;c<2;c++){const ch=buf.getChannelData(c);for(let i=0;i<buf.length;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/buf.length,1.5);}
    return buf;
  };

  const initAudio=useCallback(()=>{
    if(audioCtxRef.current) return;
    const ctx=new AudioContext();
    audioCtxRef.current=ctx;
    const master=ctx.createGain(); master.gain.value=masterVolRef.current; master.connect(ctx.destination); masterGainRef.current=master;
    const filter=ctx.createBiquadFilter(); filter.type="lowpass"; filter.frequency.value=20000; filter.Q.value=1; filter.connect(master); filterRef.current=filter;
    const rev=ctx.createConvolver(); rev.buffer=createReverbBuf(ctx); reverbRef.current=rev;
    const rg=ctx.createGain(); rg.gain.value=fxRef.current.reverb; rg.connect(master); reverbGainRef.current=rg; rev.connect(rg);
    const del=ctx.createDelay(2); del.delayTime.value=0.35; delayRef.current=del;
    const dg=ctx.createGain(); dg.gain.value=fxRef.current.delay; dg.connect(master); delayGainRef.current=dg; del.connect(dg);
  },[]);

  useEffect(()=>{
    if(status!=="authenticated") return;
    fetch("/api/pads").then(r=>r.json()).then(d=>{
      const bs=d.boards||[];
      setBoards(bs);
      if(bs.length>0){setActiveBoard(bs[0]); if(bs[0].bpm) setBpm(bs[0].bpm);}
    }).finally(()=>setLoading(false));
  },[status]);

  useEffect(()=>{
    if(!activeBoard) return;
    initAudio();
    const ctx=audioCtxRef.current!;
    activeBoard.pads.forEach(pad=>{
      if(!pad.audioUrl||buffersRef.current[pad.id]) return;
      fetch(pad.audioUrl).then(r=>r.arrayBuffer()).then(b=>ctx.decodeAudioData(b))
        .then(decoded=>{buffersRef.current[pad.id]=decoded;})
        .catch(console.warn);
    });
  },[activeBoard?.id,initAudio]);

  useEffect(()=>{
    if(!navigator.requestMIDIAccess) return;
    (navigator as any).requestMIDIAccess().then((midi:any)=>{
      const inputs=Array.from(midi.inputs.values()) as any[];
      if(inputs.length) setMidiDevice(inputs[0].name);
    }).catch(()=>{});
  },[]);

  const playPad=useCallback((pad:Pad)=>{
    const ctx=audioCtxRef.current;
    if(!ctx){initAudio();setTimeout(()=>playPad(pad),80);return;}
    if(ctx.state==="suspended") ctx.resume();
    const buf=buffersRef.current[pad.id];
    if(!buf){toast.error("Carregando áudio..."); return;}

    if(gainRef.current&&sourceRef.current){
      const og=gainRef.current, os=sourceRef.current;
      const dur=fadeOutRef.current?fadeDurRef.current:0.05;
      og.gain.setValueAtTime(og.gain.value,ctx.currentTime);
      og.gain.linearRampToValueAtTime(0,ctx.currentTime+dur);
      setTimeout(()=>{try{os.stop();}catch{}},dur*1000+100);
    }

    const source=ctx.createBufferSource();
    source.buffer=buf; source.loop=true;
    source.playbackRate.value=Math.pow(2,pitchRef.current/12);

    const gain=ctx.createGain();
    const dur=fadeInRef.current?fadeDurRef.current:0.05;
    gain.gain.setValueAtTime(0,ctx.currentTime);
    gain.gain.linearRampToValueAtTime(pad.volume,ctx.currentTime+dur);

    const f=fxRef.current;
    source.connect(gain);
    gain.connect(filterRef.current!);
    if(f.reverb>0&&reverbRef.current) gain.connect(reverbRef.current);
    if(f.delay>0&&delayRef.current) gain.connect(delayRef.current);

    source.start();
    sourceRef.current=source; gainRef.current=gain;
    setCurrentPad(pad); setIsPlaying(true);
  },[initAudio]);

  const stopPad=useCallback(()=>{
    const ctx=audioCtxRef.current;
    if(!ctx||!gainRef.current||!sourceRef.current) return;
    const g=gainRef.current, s=sourceRef.current;
    const dur=fadeOutRef.current?fadeDurRef.current:0.05;
    g.gain.setValueAtTime(g.gain.value,ctx.currentTime);
    g.gain.linearRampToValueAtTime(0,ctx.currentTime+dur);
    setTimeout(()=>{try{s.stop();}catch{};sourceRef.current=null;gainRef.current=null;},dur*1000+100);
    setIsPlaying(false);
  },[]);

  const pitchToNote=(p:number)=>{
    const idx=((Math.round(p))%12+12)%12;
    return NOTE_NAMES[idx];
  };

  if(loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>;

  const pads=activeBoard?.pads.filter(p=>p.audioUrl)||[];

  // MODO CULTO — UI minimalista
  if(modeCulto) return (
    <div className="fixed inset-0 bg-[#080a0f] flex flex-col" style={{top:64}}>
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <span className="text-sm font-bold text-white/40">MODO CULTO</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Volume1 className="h-4 w-4 text-white/30"/>
            <input type="range" min={0} max={1} step={0.01} value={masterVolume}
              onChange={e=>setMasterVolume(Number(e.target.value))}
              className="w-28 accent-primary h-1"/>
            <Volume2 className="h-4 w-4 text-white/50"/>
          </div>
          <button onClick={()=>setModeCulto(false)} className="text-xs text-white/30 hover:text-white/60 border border-white/10 rounded-lg px-3 py-1.5">Sair</button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Pads grandes */}
        <div className="flex-1 p-6 grid gap-4" style={{gridTemplateColumns:`repeat(${Math.min(pads.length,3)}, 1fr)`}}>
          {pads.map(pad=>{
            const active=currentPad?.id===pad.id&&isPlaying;
            return (
              <button key={pad.id}
                onClick={()=>{setCurrentPad(pad); if(isPlaying&&currentPad?.id!==pad.id) playPad(pad);}}
                className="relative rounded-3xl flex flex-col items-center justify-center gap-4 transition-all border-2"
                style={{
                  background:active?`radial-gradient(circle, ${pad.color}30, ${pad.color}08)`:`radial-gradient(circle, ${pad.color}10, transparent)`,
                  borderColor:active?pad.color:pad.color+"25",
                  boxShadow:active?`0 0 60px ${pad.color}40`:undefined,
                }}>
                {active&&<div className="absolute inset-0 rounded-3xl animate-pulse opacity-5" style={{backgroundColor:pad.color}}/>}
                <PadIcon name={pad.name} color={pad.color} size={60}/>
                <p className="text-lg font-bold" style={{color:active?pad.color:"rgba(255,255,255,0.6)"}}>{pad.name}</p>
              </button>
            );
          })}
        </div>
        {/* Pitch + Play */}
        <div className="w-48 border-l border-white/5 flex flex-col items-center justify-center gap-6 p-6">
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-[10px] text-white/30 uppercase tracking-widest">Pitch</span>
            <div className="flex-1 relative w-10 flex flex-col items-center">
              <input type="range" min={-12} max={12} step={1} value={pitch}
                onChange={e=>setPitch(Number(e.target.value))}
                className="accent-primary" style={{writingMode:"vertical-lr",direction:"rtl",height:"100%",cursor:"pointer"}}/>
            </div>
            <div className="text-2xl font-black" style={{color:pitch!==0?"#8B5CF6":"rgba(255,255,255,0.3)"}}>
              {pitch>0?`+${pitch}`:pitch}
            </div>
          </div>
          <button onClick={()=>{if(currentPad){isPlaying?stopPad():playPad(currentPad);}}}
            disabled={!currentPad}
            className={cn("w-full py-5 rounded-2xl text-xl font-black border-2 transition-all",
              isPlaying?"bg-red-500/20 border-red-500/50 text-red-400":"bg-primary/20 border-primary/50 text-primary",
              !currentPad&&"opacity-20")}>
            {isPlaying?"■":"▶"}
          </button>
        </div>
      </div>
    </div>
  );

  // MODO NORMAL
  return (
    <div className="flex bg-[#0b0d12] overflow-hidden" style={{height:"calc(100vh - 64px)"}}>

      {/* GRID DE PADS (CENTRO - FOCO) */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden min-w-0">

        {/* Mini header */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
            <Grid3x3 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">Worship Pads</h1>
            <p className="text-xs text-muted-foreground leading-tight">Pads e atmosferas ao vivo</p>
          </div>
          {midiDevice&&<div className="flex items-center gap-1 text-[10px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-2 py-1 ml-1"><Usb className="h-3 w-3"/>{midiDevice}</div>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={()=>setModeCulto(true)}
              className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 text-primary px-3 py-1.5 text-xs font-bold hover:bg-primary/20 transition-all">
              <Zap className="h-3.5 w-3.5"/>Modo Culto
            </button>
          </div>
        </div>

        {/* Seletor de boards — só aparece quando há mais de um */}
        {boards.length > 1 && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {boards.map(board => (
              <button
                key={board.id}
                onClick={() => { setActiveBoard(board); if(board.bpm) setBpm(board.bpm); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
                  activeBoard?.id === board.id
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80"
                )}
                style={activeBoard?.id === board.id ? { borderColor: board.color + "60", backgroundColor: board.color + "20", color: board.color } : {}}
              >
                <Grid3x3 className="h-3 w-3" />
                {board.name}
                {board.musicalKey && <span className="opacity-60 text-[10px]">{board.musicalKey}</span>}
              </button>
            ))}
          </div>
        )}

        {/* BPM + Volume master */}
        <div className="flex items-center gap-3 flex-shrink-0 bg-white/3 rounded-xl px-3 py-2 border border-white/5">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">BPM</span>
          <button onClick={()=>setBpm(v=>Math.max(40,v-1))} className="w-5 h-5 rounded bg-white/5 text-white/40 hover:bg-white/10 text-xs flex items-center justify-center">−</button>
          <span className="text-base font-black text-white tabular-nums w-9 text-center">{bpm}</span>
          <button onClick={()=>setBpm(v=>Math.min(200,v+1))} className="w-5 h-5 rounded bg-white/5 text-white/40 hover:bg-white/10 text-xs flex items-center justify-center">+</button>
          <div className="w-px h-4 bg-white/10 mx-1"/>
          <Volume1 className="h-3 w-3 text-white/30"/>
          <input type="range" min={0} max={1} step={0.01} value={masterVolume}
            onChange={e=>setMasterVolume(Number(e.target.value))}
            className="w-28 accent-primary h-1"/>
          <Volume2 className="h-3 w-3 text-white/50"/>
          <span className="text-[10px] text-white/30 tabular-nums">{Math.round(masterVolume*100)}%</span>
        </div>

        {/* GRID PRINCIPAL */}
        <div className="flex-1 grid gap-3 overflow-hidden" style={{gridTemplateColumns:`repeat(${Math.min(pads.length,activeBoard?.cols||4)},1fr)`,gridTemplateRows:`repeat(${Math.ceil(pads.length/(activeBoard?.cols||4))},1fr)`}}>
          {pads.length===0?(
            <div className="col-span-4 flex items-center justify-center text-white/20 text-sm">Nenhum timbre cadastrado.</div>
          ):pads.map(pad=>{
            const active=currentPad?.id===pad.id&&isPlaying;
            const selected=currentPad?.id===pad.id;
            return (
              <button key={pad.id}
                onClick={()=>{setCurrentPad(pad); if(isPlaying) playPad(pad);}}
                className={cn("relative rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-all hover:scale-[1.02]",active&&"scale-[0.97] hover:scale-[0.97]")}
                style={{
                  background:active
                    ?`radial-gradient(ellipse at 50% 40%, ${pad.color}35, ${pad.color}08 70%)`
                    :selected
                    ?`radial-gradient(ellipse at 50% 40%, ${pad.color}18, transparent 70%)`
                    :"rgba(255,255,255,0.02)",
                  borderColor:active?pad.color:selected?pad.color+"55":"rgba(255,255,255,0.06)",
                  boxShadow:active?`0 0 40px ${pad.color}35, inset 0 1px 0 ${pad.color}40`:selected?`0 0 20px ${pad.color}15`:"none",
                }}>
                {active&&<div className="absolute inset-0 rounded-2xl animate-pulse opacity-[0.07]" style={{backgroundColor:pad.color}}/>}
                {/* Glow ring quando ativo */}
                {active&&<div className="absolute inset-[-2px] rounded-2xl animate-pulse" style={{border:`1px solid ${pad.color}60`,opacity:0.5}}/>}
                <PadIcon name={pad.name} color={pad.color} size={44}/>
                <p className="text-sm font-bold text-center px-2 leading-tight" style={{color:active?pad.color:selected?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.4)"}}>{pad.name}</p>
                {active&&(
                  <div className="flex gap-0.5 items-end h-3 px-2">
                    {[0.4,0.9,0.6,1,0.5,0.8,0.3].map((h,i)=>(
                      <div key={i} className="flex-1 rounded-full" style={{height:`${h*100}%`,backgroundColor:pad.color,opacity:0.8,animation:`pulse ${0.6+i*0.1}s ease-in-out infinite alternate`,animationDelay:`${i*0.08}s`}}/>
                    ))}
                  </div>
                )}
                {selected&&!active&&<span className="text-[8px] text-white/20">● selecionado</span>}
              </button>
            );
          })}
        </div>

        {/* PLAYER MINI */}
        <div className="flex-shrink-0 flex items-center gap-3 bg-white/3 rounded-xl border border-white/5 px-3 py-2">
          <div className="flex flex-col flex-shrink-0">
            <span className="text-[8px] text-white/25 uppercase tracking-widest">Tocando</span>
            <span className="text-xs font-semibold" style={{color:currentPad?.color||"rgba(255,255,255,0.3)"}}>
              {currentPad?.name||"—"}
            </span>
          </div>
          <div className="flex-1 h-7 rounded-lg overflow-hidden bg-black/20 px-2 py-1 min-w-0">
            <MiniWaveform color={currentPad?.color||"#444"} playing={isPlaying} intensity={intensity}/>
          </div>
          <button onClick={()=>{if(!currentPad){toast.error("Selecione um timbre");return;} isPlaying?stopPad():playPad(currentPad);}}
            className={cn("rounded-lg px-4 py-2 font-black text-xs border-2 transition-all whitespace-nowrap flex-shrink-0",
              isPlaying?"bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25":"bg-primary/15 border-primary/40 text-primary hover:bg-primary/25",
              !currentPad&&"opacity-30 cursor-not-allowed")}>
            {isPlaying?"■ STOP":"▶ PLAY"}
          </button>
          <button onClick={()=>setFadeIn(v=>!v)}
            className={cn("rounded px-2 py-1.5 text-[9px] font-bold border transition-all flex-shrink-0",
              fadeIn?"border-primary/40 bg-primary/15 text-primary":"border-white/10 text-white/25 hover:text-white/50")}>
            ↑ FI
          </button>
          <button onClick={()=>setFadeOut(v=>!v)}
            className={cn("rounded px-2 py-1.5 text-[9px] font-bold border transition-all flex-shrink-0",
              fadeOut?"border-primary/40 bg-primary/15 text-primary":"border-white/10 text-white/25 hover:text-white/50")}>
            ↓ FO
          </button>
          <select value={fadeDuration} onChange={e=>setFadeDuration(Number(e.target.value))}
            className="rounded bg-white/5 border border-white/10 text-white/35 text-[9px] px-1.5 py-1.5 flex-shrink-0">
            {[1,2,3,5,8,10].map(v=><option key={v} value={v}>{v}s</option>)}
          </select>
        </div>
      </div>

      {/* PAINEL DIREITO — Controles */}
      <div className="w-52 border-l border-white/5 flex flex-col bg-black/20 overflow-hidden">

        {/* PITCH SLIDER VERTICAL */}
        <div className="flex flex-col items-center gap-2 p-3 border-b border-white/5" style={{flex:"0 0 auto", height:"55%"}}>
          <span className="text-[9px] text-white/30 uppercase tracking-widest flex-shrink-0">Pitch / Tom</span>

          {/* Nota atual — destaque principal */}
          <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
            <div className={cn(
              "text-4xl font-black tabular-nums leading-none transition-all",
              pitch!==0?"text-violet-400 drop-shadow-[0_0_12px_rgba(139,92,246,0.8)]":"text-white/15"
            )}>
              {pitchToNote(pitch)}
            </div>
            <div className={cn(
              "text-lg font-bold tabular-nums transition-all",
              pitch>0?"text-emerald-400":pitch<0?"text-amber-400":"text-white/20"
            )}>
              {pitch>0?`+${pitch}`:pitch===0?"0":pitch}
            </div>
          </div>

          {/* Slider vertical */}
          <div className="flex-1 flex items-center justify-center w-full min-h-0">
            <input type="range" min={-12} max={12} step={1} value={pitch}
              onChange={e=>setPitch(Number(e.target.value))}
              className="accent-violet-500"
              style={{writingMode:"vertical-lr" as any,direction:"rtl",height:"100%",cursor:"pointer",maxHeight:140}}/>
          </div>

          <button onClick={()=>setPitch(0)}
            className="flex-shrink-0 text-[9px] text-white/20 hover:text-white/50 border border-white/10 rounded px-2 py-0.5 transition-all">
            Reset
          </button>
        </div>

        {/* KNOBS DE EFEITO */}
        <div className="flex flex-col gap-3 p-3 flex-1 overflow-hidden">
          <span className="text-[9px] text-white/30 uppercase tracking-widest flex-shrink-0">Atmosfera</span>
          <div className="grid grid-cols-2 gap-2 place-items-center flex-shrink-0">
            <Knob value={fx.reverb} min={0} max={1} label="Reverb" color="#8B5CF6" size={50}
              onChange={v=>setFx(p=>({...p,reverb:v}))}/>
            <Knob value={fx.delay} min={0} max={1} label="Delay" color="#06B6D4" size={50}
              onChange={v=>setFx(p=>({...p,delay:v}))}/>
            <Knob value={fx.filter} min={0} max={1} label="Cutoff" color="#10B981" size={50}
              onChange={v=>setFx(p=>({...p,filter:v}))}/>
            <Knob value={fx.shimmer} min={0} max={1} label="Shimmer" color="#F59E0B" size={50}
              onChange={v=>setFx(p=>({...p,shimmer:v}))}/>
          </div>
          <div className="flex-shrink-0 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[9px] text-white/30 uppercase tracking-widest">Intensidade</span>
              <span className="text-[9px] text-white/40">{Math.round(intensity*100)}%</span>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={intensity}
              onChange={e=>setIntensity(Number(e.target.value))}
              className="w-full accent-primary h-1"/>
          </div>
        </div>
      </div>
    </div>
  );
}
