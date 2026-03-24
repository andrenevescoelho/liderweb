"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play, Square, Music, Minus, Plus, Timer, ListMusic,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TIME_SIGNATURES = ["2/4", "3/4", "4/4", "6/8"] as const;
type TimeSignature = typeof TIME_SIGNATURES[number];

interface SongPreset {
  id: string;
  title: string;
  artist?: string | null;
  bpm: number | null;
  timeSignature: string;
}

function beatsForSignature(sig: TimeSignature): number {
  return parseInt(sig.split("/")[0]);
}

export default function MetronomoPage() {
  const { data: session } = useSession() || {};
  const user = session?.user as SessionUser | undefined;

  const [bpm, setBpm] = useState(100);
  const [timeSignature, setTimeSignature] = useState<TimeSignature>("4/4");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const [songs, setSongs] = useState<SongPreset[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const schedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureCountRef = useRef(0);
  const bpmRef = useRef(bpm);
  const sigRef = useRef(timeSignature);

  bpmRef.current = bpm;
  sigRef.current = timeSignature;

  // Carregar músicas do grupo como presets
  useEffect(() => {
    if (!user?.groupId) return;
    setLoadingSongs(true);
    fetch("/api/songs?limit=50")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.songs || data || []) as SongPreset[];
        setSongs(list.filter((s) => s.bpm && s.bpm > 0));
      })
      .catch(() => {})
      .finally(() => setLoadingSongs(false));
  }, [user?.groupId]);

  const playClick = useCallback((time: number, isAccent: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = isAccent ? 1000 : 800;
    gain.gain.setValueAtTime(isAccent ? 1.0 : 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
  }, []);

  const scheduleNote = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const beatsPerMeasure = beatsForSignature(sigRef.current);
    const secondsPerBeat = 60.0 / bpmRef.current;
    const scheduleAhead = 0.1;

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAhead) {
      const isAccent = currentBeatRef.current === 0;
      playClick(nextNoteTimeRef.current, isAccent);

      const beatIndex = currentBeatRef.current;
      const measureIdx = measureCountRef.current;
      const delay = (nextNoteTimeRef.current - ctx.currentTime) * 1000;

      setTimeout(() => {
        setCurrentBeat(beatIndex);
        if (beatIndex === beatsPerMeasure - 1) {
          measureCountRef.current = measureIdx + 1;
          setMeasureCount(measureIdx + 1);
        }
      }, Math.max(0, delay));

      nextNoteTimeRef.current += secondsPerBeat;
      currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerMeasure;
    }

    schedulerRef.current = setTimeout(scheduleNote, 25);
  }, [playClick]);

  const start = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    currentBeatRef.current = 0;
    measureCountRef.current = 0;
    nextNoteTimeRef.current = audioCtxRef.current.currentTime + 0.05;
    setCurrentBeat(0);
    setMeasureCount(0);
    setIsPlaying(true);
    scheduleNote();
  }, [scheduleNote]);

  const stop = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    setIsPlaying(false);
    setCurrentBeat(0);
    setMeasureCount(0);
    currentBeatRef.current = 0;
    measureCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (schedulerRef.current) clearTimeout(schedulerRef.current);
    };
  }, []);

  // Reinicia se mudar BPM ou compasso enquanto toca
  useEffect(() => {
    if (isPlaying) {
      if (schedulerRef.current) clearTimeout(schedulerRef.current);
      currentBeatRef.current = 0;
      const ctx = audioCtxRef.current;
      if (ctx) {
        nextNoteTimeRef.current = ctx.currentTime + 0.05;
        scheduleNote();
      }
    }
  }, [bpm, timeSignature, isPlaying, scheduleNote]);

  // Tap tempo
  const handleTap = () => {
    const now = Date.now();
    setTapTimes((prev) => {
      const recent = [...prev, now].filter((t) => now - t < 3000).slice(-8);
      if (recent.length >= 2) {
        const diffs = recent.slice(1).map((t, i) => t - recent[i]);
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const detected = Math.round(60000 / avg);
        setBpm(Math.min(240, Math.max(30, detected)));
      }
      return recent;
    });
  };

  const beatsPerMeasure = beatsForSignature(timeSignature);

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <Timer className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metrônomo</h1>
          <p className="text-sm text-muted-foreground">Ferramenta de tempo para ensaios e práticas</p>
        </div>
      </div>

      {/* Visualização do pulso */}
      <Card>
        <CardContent className="pt-6 pb-4">
          <div className="flex justify-center gap-3 mb-6">
            {Array.from({ length: beatsPerMeasure }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-full transition-all duration-75",
                  i === 0 ? "w-8 h-8" : "w-6 h-6",
                  isPlaying && currentBeat === i
                    ? i === 0
                      ? "bg-primary scale-125 shadow-[0_0_16px_rgba(20,184,166,0.8)]"
                      : "bg-primary/70 scale-110"
                    : i === 0
                    ? "bg-primary/20 border-2 border-primary/40"
                    : "bg-muted border border-border"
                )}
              />
            ))}
          </div>

          {/* BPM */}
          <div className="text-center mb-4">
            <div className="text-6xl font-bold text-primary tabular-nums">{bpm}</div>
            <div className="text-sm text-muted-foreground mt-1">BPM</div>
          </div>

          {/* Slider */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setBpm((b) => Math.max(30, b - 1))}
              className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={30}
              max={240}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <button
              onClick={() => setBpm((b) => Math.min(240, b + 1))}
              className="rounded-lg border border-border p-2 hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Controles */}
          <div className="flex gap-3 justify-center">
            <Button
              size="lg"
              variant="outline"
              onClick={handleTap}
              className="flex-1 max-w-[140px]"
            >
              Tap
            </Button>
            <Button
              size="lg"
              onClick={isPlaying ? stop : start}
              className={cn("flex-1 max-w-[140px]", isPlaying && "bg-red-500 hover:bg-red-600 border-red-500")}
            >
              {isPlaying ? (
                <><Square className="mr-2 h-4 w-4" /> Parar</>
              ) : (
                <><Play className="mr-2 h-4 w-4" /> Iniciar</>
              )}
            </Button>
          </div>

          {isPlaying && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              Compasso {measureCount + 1}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Compasso */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Compasso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {TIME_SIGNATURES.map((sig) => (
              <button
                key={sig}
                onClick={() => setTimeSignature(sig)}
                className={cn(
                  "flex-1 rounded-lg border py-2.5 text-sm font-medium transition-all",
                  timeSignature === sig
                    ? "bg-primary/10 border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {sig}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Presets de músicas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ListMusic className="h-4 w-4" />
            Presets — Músicas do Grupo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSongs ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : songs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma música com BPM cadastrado.
            </p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {songs.map((song) => (
                <button
                  key={song.id}
                  onClick={() => {
                    if (song.bpm) setBpm(song.bpm);
                    const sig = TIME_SIGNATURES.find((s) => s === song.timeSignature);
                    if (sig) setTimeSignature(sig);
                    if (isPlaying) stop();
                  }}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{song.title}</p>
                    {song.artist && <p className="text-xs text-muted-foreground truncate">{song.artist}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {song.bpm} BPM
                    </span>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {song.timeSignature}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
