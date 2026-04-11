"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { ModuleAccessOverlay } from "@/components/module-access-overlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  Music,
  BookOpen,
  Lightbulb,
  Dumbbell,
  RefreshCw,
  Loader2,
  Star,
  Award,
  BarChart3,
  Mic2,
  Mic,
  MicOff,
  Square,
  Upload,
  Play,
  Pause,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Trophy,
  Target,
  TrendingUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface DashboardData {
  level: number;
  memberFunction: string | null;
  instruments: string[];
  voiceType: string | null;
  roles: string[];
  submissionCount: number;
  latestProgress: Array<{ metricType: string; value: number; createdAt: string }>;
}

type ContentTab = "general" | "exercises" | "theory" | "tips";
type MainSection = "content" | "record" | "history" | "progress";

interface FeedbackData {
  id: string;
  score: number | null;
  feedback: string | null;
  suggestions: string | null;
  metricsJson: Record<string, unknown> | null;
  createdAt: string;
}

interface SubmissionData {
  id: string;
  type: string;
  instrument: string | null;
  notes: string | null;
  audioPlayUrl: string | null;
  createdAt: string;
  feedback: FeedbackData | null;
}

interface HistoryResponse {
  submissions: SubmissionData[];
  total: number;
  page: number;
  totalPages: number;
}

/* ─── Constants ─── */
const MAX_RECORDING_SECONDS = 180; // 3 minutos — limite para análise do Gemini

const CONTENT_TABS: { key: ContentTab; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "Hoje", icon: <Lightbulb className="h-4 w-4" /> },
  { key: "exercises", label: "Exercícios", icon: <Dumbbell className="h-4 w-4" /> },
  { key: "theory", label: "Teoria", icon: <BookOpen className="h-4 w-4" /> },
  { key: "tips", label: "Dicas", icon: <Star className="h-4 w-4" /> },
];

const MAIN_SECTIONS: { key: MainSection; label: string; icon: React.ReactNode }[] = [
  { key: "content", label: "Conteúdo", icon: <BookOpen className="h-4 w-4" /> },
  { key: "record", label: "Gravar Prática", icon: <Mic className="h-4 w-4" /> },
  { key: "history", label: "Histórico", icon: <Clock className="h-4 w-4" /> },
  { key: "progress", label: "Progresso", icon: <BarChart3 className="h-4 w-4" /> },
];

const PRACTICE_TYPES = [
  { value: "vocal", label: "Vocal" },
  { value: "instrumental", label: "Instrumental" },
  { value: "rehearsal", label: "Ensaio" },
  { value: "warmup", label: "Aquecimento" },
];

/* ─── Helpers ─── */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">Sem nota</span>;
  const color = score >= 80 ? "bg-emerald-500/20 text-emerald-400" : score >= 60 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400";
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", color)}>{score}/100</span>;
}

/* ═══════════════════════════════════════════ */
export default function ProfessorPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockedByPlan, setBlockedByPlan] = useState(false);
  const [mainSection, setMainSection] = useState<MainSection>("content");

  /* ─── Content state ─── */
  const [activeTab, setActiveTab] = useState<ContentTab>("general");
  const [content, setContent] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState(false);
  const [cachedFlags, setCachedFlags] = useState<Record<string, boolean>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  /* ─── Recording state ─── */
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [practiceType, setPracticeType] = useState("vocal");
  const [practiceInstrument, setPracticeInstrument] = useState("");
  const [practiceNotes, setPracticeNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [inlineFeedback, setInlineFeedback] = useState<any | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingTarget, setSpeakingTarget] = useState<"content" | "feedback" | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── History state ─── */
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  /* ─── Init: load dashboard ─── */
  useEffect(() => {
    if (status === "loading") return;
    if (!user) { router.replace("/login"); return; }
    const fetchDash = async () => {
      try {
        const subscriptionRes = await fetch("/api/subscription/status");
        if (subscriptionRes.ok) {
          const subscriptionStatus = await subscriptionRes.json();
          if (!subscriptionStatus?.moduleAccess?.professor) {
            setBlockedByPlan(true);
            return;
          }
        }
        const res = await fetch("/api/music-coach/dashboard");
        if (res.status === 403) { router.replace("/dashboard"); return; }
        if (!res.ok) throw new Error();
        setDashData(await res.json());
      } catch { router.replace("/dashboard"); }
      finally { setLoading(false); }
    };
    fetchDash();
  }, [status, user, router]);

  /* ─── Content generation (cache-aware) ─── */
  const generateContent = useCallback(async (type: ContentTab, forceRefresh = false) => {
    if (streaming) return;
    setStreaming(true);
    setContent((prev) => ({ ...prev, [type]: "" }));
    setCachedFlags((prev) => ({ ...prev, [type]: false }));

    try {
      const res = await fetch("/api/music-coach/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, forceRefresh }),
      });

      if (!res.ok) throw new Error();

      const ct = res.headers.get("content-type") || "";

      // Cached response (JSON, no streaming)
      if (ct.includes("application/json")) {
        const data = await res.json();
        setContent((prev) => ({ ...prev, [type]: data.content || "" }));
        setCachedFlags((prev) => ({ ...prev, [type]: !!data.cached }));
        return;
      }

      // Streaming response
      if (!res.body) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              accumulated += parsed.content;
              setContent((prev) => ({ ...prev, [type]: accumulated }));
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setContent((prev) => ({ ...prev, [type]: "Erro ao gerar conteúdo. Tente novamente." }));
    } finally {
      setStreaming(false);
    }
  }, [streaming]);

  // Auto-load content when switching tabs
  useEffect(() => {
    if (mainSection === "content" && dashData && !content[activeTab] && !streaming) {
      generateContent(activeTab);
    }
  }, [activeTab, mainSection, dashData, content, streaming, generateContent]);

  /* ─── Audio Recording ─── */

  // Converte qualquer blob de áudio para WAV usando Web Audio API
  const convertToWav = async (blob: Blob): Promise<Blob> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numSamples = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const dataLength = numSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    await audioCtx.close();
    return new Blob([buffer], { type: "audio/wav" });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      setAudioBlob(null);
      setAudioPreviewUrl(null);
      setUploadStatus("idle");
      timerRef.current = setInterval(() => setRecordingTime((t) => {
        if (t + 1 >= MAX_RECORDING_SECONDS) {
          // Parar automaticamente ao atingir o limite
          recorder.stop();
          setIsRecording(false);
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          return MAX_RECORDING_SECONDS;
        }
        return t + 1;
      }), 1000);
    } catch (err) {
      console.error("Microphone error:", err);
      setUploadStatus("error");
      setUploadMessage("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const discardRecording = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingTime(0);
    setUploadStatus("idle");
    setInlineFeedback(null);
    setIsSpeaking(false);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  };

  const submitRecording = async () => {
    if (!audioBlob) return;
    setUploading(true);
    setUploadStatus("idle");
    setUploadMessage("Convertendo áudio...");

    try {
      // Converter para WAV (suportado pelo LLM)
      let uploadBlob: Blob;
      try {
        uploadBlob = await convertToWav(audioBlob);
      } catch (convErr) {
        console.error("Conversão para WAV falhou, usando original:", convErr);
        uploadBlob = audioBlob;
      }

      // 1. Get presigned URL
      const fileName = `practice-${Date.now()}.wav`;
      const presignRes = await fetch("/api/music-coach/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, contentType: "audio/wav" }),
      });
      if (!presignRes.ok) throw new Error("Falha ao obter URL de upload");
      const { uploadUrl, cloud_storage_path } = await presignRes.json();

      // 2. Upload to S3
      setUploadMessage("Enviando áudio...");
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get("X-Amz-SignedHeaders") || "";
      const headers: Record<string, string> = { "Content-Type": "audio/wav" };
      if (signedHeaders.includes("content-disposition")) {
        headers["Content-Disposition"] = "attachment";
      }
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: uploadBlob,
      });
      if (!uploadRes.ok) throw new Error("Falha no upload do áudio");

      // 3. Submit for AI analysis
      setUploadMessage("Áudio enviado! Analisando com IA...");
      const submitRes = await fetch("/api/music-coach/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cloud_storage_path,
          type: practiceType,
          instrument: practiceType === "instrumental" ? practiceInstrument : null,
          notes: practiceNotes || null,
        }),
      });
      if (!submitRes.ok) throw new Error("Falha ao enviar para análise");

      const result = await submitRes.json();
      setUploadStatus("success");
      setUploadMessage(
        result.feedback?.score
          ? `Análise concluída! Nota: ${result.feedback.score}/100`
          : "Prática enviada! Feedback sendo processado."
      );
      if (result.feedback) setInlineFeedback(result.feedback);
      // Refresh dashboard count
      setDashData((prev) => prev ? { ...prev, submissionCount: prev.submissionCount + 1 } : prev);
      // Clear form after short delay
      setTimeout(() => {
        discardRecording();
        setPracticeNotes("");
        setPracticeInstrument("");
      }, 3000);
    } catch (err) {
      console.error("Submit error:", err);
      setUploadStatus("error");
      setUploadMessage(err instanceof Error ? err.message : "Erro ao enviar prática.");
    } finally {
      setUploading(false);
    }
  };

  /* ─── History ─── */
  const fetchHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/music-coach/history?page=${page}&limit=10`);
      if (res.ok) {
        setHistory(await res.json());
        setHistoryPage(page);
      }
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (mainSection === "history" && !history) fetchHistory(1);
  }, [mainSection, history, fetchHistory]);

  const togglePlayAudio = (url: string, submissionId: string) => {
    if (playingAudio === submissionId) {
      audioPlayerRef.current?.pause();
      setPlayingAudio(null);
      return;
    }
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    const audio = new Audio(url);
    audio.onended = () => setPlayingAudio(null);
    audio.play();
    audioPlayerRef.current = audio;
    setPlayingAudio(submissionId);
  };

  /* ─── Cleanup ─── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      audioPlayerRef.current?.pause();
    };
  }, []);

  /* ─── Loading / guard ─── */
  if (status === "loading" || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (blockedByPlan) {
    return (
      <div className="relative">
        <div className="space-y-6 opacity-35 pointer-events-none select-none">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-7 w-7 text-primary" />
              Professor
            </h1>
            <p className="text-muted-foreground mt-1">Seu assistente personalizado de aprendizado musical.</p>
          </div>
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Este módulo não está disponível no plano atual.
            </CardContent>
          </Card>
        </div>
        <ModuleAccessOverlay
          moduleLabel="Professor IA"
          isAdmin={user?.role === "ADMIN" || user?.role === "SUPERADMIN"}
          onUpgrade={() => router.push("/meu-plano")}
        />
      </div>
    );
  }

  if (!dashData) return null;

  const levelLabel = dashData.level <= 2 ? "Iniciante" : dashData.level <= 5 ? "Intermediário" : "Avançado";
  const levelColor = dashData.level <= 2 ? "text-emerald-400" : dashData.level <= 5 ? "text-blue-400" : "text-amber-400";

  return (
    <div className="relative">
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-primary" />
          Professor
        </h1>
        <p className="text-muted-foreground mt-1">
          Seu assistente personalizado de aprendizado musical.
        </p>
      </div>

      {/* Profile Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Award className={cn("h-5 w-5", levelColor)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Nível</p>
                <p className={cn("font-semibold", levelColor)}>{dashData.level} — {levelLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2">
                <Music className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Instrumentos</p>
                <p className="font-semibold text-sm">{dashData.instruments.length > 0 ? dashData.instruments.join(", ") : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2">
                <Mic2 className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Voz / Função</p>
                <p className="font-semibold text-sm">{dashData.voiceType || dashData.memberFunction || dashData.roles[0] || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <BarChart3 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Práticas Enviadas</p>
                <p className="font-semibold">{dashData.submissionCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Section Tabs */}
      <div className="flex gap-1 border-b border-border">
        {MAIN_SECTIONS.map((sec) => (
          <button
            key={sec.key}
            onClick={() => setMainSection(sec.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors",
              mainSection === sec.key
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {sec.icon}
            {sec.label}
          </button>
        ))}
      </div>

      {/* ═══ CONTENT SECTION ═══ */}
      {mainSection === "content" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Conteúdo Personalizado</CardTitle>
              <div className="flex items-center gap-2">
                {cachedFlags[activeTab] && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Em cache</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateContent(activeTab, true)}
                  disabled={streaming}
                >
                  {streaming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Gerar Novo
                </Button>
              </div>
            </div>
            <div className="flex gap-1 mt-2 border-b border-border pb-0">
              {CONTENT_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md transition-colors",
                    activeTab === tab.key
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div ref={contentRef} className="min-h-[200px] prose prose-invert max-w-none">
              {streaming && !content[activeTab] ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Gerando conteúdo personalizado...</span>
                </div>
              ) : content[activeTab] ? (
                <div className="space-y-3">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {content[activeTab]}
                    {streaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />}
                  </div>
                  {!streaming && (
                    <div className="pt-2 border-t border-border/50">
                      <button
                        onClick={() => {
                          if (speakingTarget === "content") {
                            window.speechSynthesis.cancel();
                            setSpeakingTarget(null);
                            setIsSpeaking(false);
                            return;
                          }
                          window.speechSynthesis.cancel();
                          const utt = new SpeechSynthesisUtterance(content[activeTab]);
                          utt.lang = "pt-BR";
                          utt.rate = 0.95;
                          utt.onend = () => { setSpeakingTarget(null); setIsSpeaking(false); };
                          utt.onerror = () => { setSpeakingTarget(null); setIsSpeaking(false); };
                          window.speechSynthesis.speak(utt);
                          setSpeakingTarget("content");
                          setIsSpeaking(true);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                          speakingTarget === "content"
                            ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                      >
                        {speakingTarget === "content"
                          ? <><VolumeX className="h-3 w-3" /> Parar</>
                          : <><Volume2 className="h-3 w-3" /> Ouvir conteúdo</>
                        }
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Clique em &quot;Gerar Novo&quot; para receber conteúdo personalizado.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ RECORD SECTION ═══ */}
      {mainSection === "record" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                Gravar Prática
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Aviso de limite */}
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Limite de 3 minutos por prática.</span>{" "}
                  A gravação para automaticamente ao atingir esse tempo. Para análises mais longas, divida em múltiplas práticas.
                </div>
              </div>
              {/* Practice type selection */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Tipo de Prática</label>
                  <select
                    value={practiceType}
                    onChange={(e) => setPracticeType(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {PRACTICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {practiceType === "instrumental" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Instrumento</label>
                    <input
                      type="text"
                      value={practiceInstrument}
                      onChange={(e) => setPracticeInstrument(e.target.value)}
                      placeholder="Ex: Violão, Teclado, Bateria..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Observações (opcional)</label>
                <textarea
                  value={practiceNotes}
                  onChange={(e) => setPracticeNotes(e.target.value)}
                  placeholder="Descreva o que você está praticando, música, escala, exercício..."
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Recording controls */}
              <div className="flex flex-col items-center gap-4 py-4">
                {/* Timer com cor progressiva */}
                <div className={cn(
                  "text-3xl font-mono font-bold tabular-nums transition-colors",
                  recordingTime >= MAX_RECORDING_SECONDS ? "text-red-500" :
                  recordingTime >= MAX_RECORDING_SECONDS * 0.8 ? "text-amber-500" :
                  "text-foreground"
                )}>
                  {formatDuration(recordingTime)}
                  <span className="text-sm font-normal text-muted-foreground ml-2">/ {formatDuration(MAX_RECORDING_SECONDS)}</span>
                </div>

                {/* Barra de progresso do tempo */}
                {(isRecording || recordingTime > 0) && (
                  <div className="w-full max-w-xs">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          recordingTime >= MAX_RECORDING_SECONDS ? "bg-red-500" :
                          recordingTime >= MAX_RECORDING_SECONDS * 0.8 ? "bg-amber-500" :
                          "bg-primary"
                        )}
                        style={{ width: `${Math.min((recordingTime / MAX_RECORDING_SECONDS) * 100, 100)}%` }}
                      />
                    </div>
                    {recordingTime >= MAX_RECORDING_SECONDS * 0.8 && recordingTime < MAX_RECORDING_SECONDS && (
                      <p className="text-xs text-amber-500 text-center mt-1">
                        Gravação encerra em {MAX_RECORDING_SECONDS - recordingTime}s
                      </p>
                    )}
                    {recordingTime >= MAX_RECORDING_SECONDS && (
                      <p className="text-xs text-red-500 text-center mt-1">
                        Limite atingido — gravação encerrada automaticamente
                      </p>
                    )}
                  </div>
                )}

                {/* Waveform indicator */}
                {isRecording && (
                  <div className="flex items-center gap-1 h-8">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-red-500 rounded-full animate-pulse"
                        style={{
                          height: `${Math.random() * 100}%`,
                          animationDelay: `${i * 0.1}s`,
                          minHeight: "4px",
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  {!isRecording && !audioBlob && (
                    <Button onClick={startRecording} size="lg" className="gap-2 bg-red-600 hover:bg-red-700">
                      <Mic className="h-5 w-5" />
                      Iniciar Gravação
                    </Button>
                  )}
                  {isRecording && (
                    <Button onClick={stopRecording} size="lg" variant="outline" className="gap-2 border-red-500 text-red-500 hover:bg-red-500/10">
                      <Square className="h-4 w-4 fill-current" />
                      Parar
                    </Button>
                  )}
                  {audioBlob && !isRecording && (
                    <>
                      <Button onClick={discardRecording} variant="outline" size="sm" className="gap-1">
                        <Trash2 className="h-4 w-4" />
                        Descartar
                      </Button>
                      <Button onClick={submitRecording} disabled={uploading} size="lg" className="gap-2">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? "Enviando..." : "Enviar para Análise"}
                      </Button>
                    </>
                  )}
                </div>

                {/* Audio Preview */}
                {audioPreviewUrl && !isRecording && (
                  <div className="w-full max-w-md">
                    <audio controls src={audioPreviewUrl} className="w-full" />
                  </div>
                )}

                {/* Status messages */}
                {uploadStatus === "error" && (
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {uploadMessage}
                  </div>
                )}
                {uploading && uploadMessage && uploadStatus === "idle" && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>{uploadMessage}</span>
                  </div>
                )}

                {/* Feedback inline após análise */}
                {uploadStatus === "success" && inlineFeedback && (
                  <div className="w-full space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                    {/* Header com nota e TTS */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="font-semibold">{uploadMessage}</span>
                      </div>
                      {inlineFeedback.feedback && (
                        <button
                          onClick={() => {
                            if (speakingTarget === "feedback") {
                              window.speechSynthesis.cancel();
                              setSpeakingTarget(null);
                              setIsSpeaking(false);
                              return;
                            }
                            window.speechSynthesis.cancel();
                            const text = [
                              inlineFeedback.feedback,
                              ...(inlineFeedback.metricsJson?.pontos_fortes ?? []).map((p: string) => `Ponto forte: ${p}`),
                              ...(inlineFeedback.metricsJson?.areas_melhoria ?? []).map((a: string) => `Área para melhorar: ${a}`),
                              inlineFeedback.metricsJson?.exercicio_recomendado
                                ? `Exercício recomendado: ${inlineFeedback.metricsJson.exercicio_recomendado}`
                                : null,
                            ].filter(Boolean).join(". ");
                            const utt = new SpeechSynthesisUtterance(text);
                            utt.lang = "pt-BR";
                            utt.rate = 0.95;
                            utt.onend = () => { setSpeakingTarget(null); setIsSpeaking(false); };
                            utt.onerror = () => { setSpeakingTarget(null); setIsSpeaking(false); };
                            window.speechSynthesis.speak(utt);
                            setSpeakingTarget("feedback");
                            setIsSpeaking(true);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                            speakingTarget === "feedback"
                              ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                              : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          )}
                        >
                          {speakingTarget === "feedback" ? <><VolumeX className="h-3 w-3" /> Parar</> : <><Volume2 className="h-3 w-3" /> Ouvir feedback</>}
                        </button>
                      )}
                    </div>

                    {/* Feedback geral */}
                    {inlineFeedback.feedback && (
                      <p className="text-sm leading-relaxed text-foreground/90">{inlineFeedback.feedback}</p>
                    )}

                    {/* Pontos fortes */}
                    {(inlineFeedback.metricsJson?.pontos_fortes ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-emerald-400 mb-1">Pontos Fortes</p>
                        <ul className="space-y-1">
                          {(inlineFeedback.metricsJson.pontos_fortes as string[]).map((p, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Áreas para melhorar */}
                    {(inlineFeedback.metricsJson?.areas_melhoria ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-400 mb-1">Áreas para Melhorar</p>
                        <ul className="space-y-1">
                          {(inlineFeedback.metricsJson.areas_melhoria as string[]).map((a, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Exercício recomendado */}
                    {inlineFeedback.metricsJson?.exercicio_recomendado && (
                      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                        <p className="text-xs font-semibold text-blue-400 mb-0.5">Exercício Recomendado</p>
                        <p className="text-xs">{inlineFeedback.metricsJson.exercicio_recomendado}</p>
                      </div>
                    )}

                    <button
                      onClick={() => { discardRecording(); setPracticeNotes(""); setPracticeInstrument(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground underline mt-1"
                    >
                      Gravar nova prática
                    </button>
                  </div>
                )}

                {uploadStatus === "success" && !inlineFeedback && (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    {uploadMessage}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ HISTORY SECTION ═══ */}
      {mainSection === "history" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Histórico de Práticas
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => fetchHistory(historyPage)} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {historyLoading && !history ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !history || history.submissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mic2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">Nenhuma prática enviada ainda</p>
                <p className="text-sm mt-1">Grave sua primeira prática na aba &quot;Gravar Prática&quot;.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.submissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {sub.audioPlayUrl && (
                          <button
                            onClick={() => togglePlayAudio(sub.audioPlayUrl!, sub.id)}
                            className="flex-shrink-0 rounded-full bg-primary/10 p-2 hover:bg-primary/20 transition-colors"
                          >
                            {playingAudio === sub.id ? <Pause className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary" />}
                          </button>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm capitalize">{sub.type}</span>
                            {sub.instrument && <span className="text-xs text-muted-foreground">• {sub.instrument}</span>}
                            {sub.feedback && <ScoreBadge score={sub.feedback.score} />}
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDate(sub.createdAt)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setExpandedSubmission(expandedSubmission === sub.id ? null : sub.id)}
                        className="text-xs text-primary hover:underline flex-shrink-0"
                      >
                        {expandedSubmission === sub.id ? "Fechar" : "Ver Feedback"}
                      </button>
                    </div>

                    {/* Expanded Feedback */}
                    {expandedSubmission === sub.id && sub.feedback && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3">
                        {sub.feedback.feedback && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-muted-foreground">Feedback</p>
                              <button
                                onClick={() => {
                                  if (window.speechSynthesis.speaking) {
                                    window.speechSynthesis.cancel();
                                    return;
                                  }
                                  const m = sub.feedback!.metricsJson as Record<string, any> ?? {};
                                  const text = [
                                    sub.feedback!.feedback,
                                    ...(m.pontos_fortes ?? []).map((p: string) => `Ponto forte: ${p}`),
                                    ...(m.areas_melhoria ?? []).map((a: string) => `Área para melhorar: ${a}`),
                                    m.exercicio_recomendado ? `Exercício: ${m.exercicio_recomendado}` : null,
                                  ].filter(Boolean).join(". ");
                                  const utt = new SpeechSynthesisUtterance(text);
                                  utt.lang = "pt-BR";
                                  utt.rate = 0.95;
                                  window.speechSynthesis.speak(utt);
                                }}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                              >
                                <Volume2 className="h-3 w-3" /> Ouvir
                              </button>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{sub.feedback.feedback}</p>
                          </div>
                        )}
                        {sub.feedback.metricsJson && (() => {
                          const m = sub.feedback.metricsJson as Record<string, unknown>;
                          const pontos = (m.pontos_fortes || []) as string[];
                          const areas = (m.areas_melhoria || []) as string[];
                          const exercicio = m.exercicio_recomendado as string;
                          return (
                            <>
                              {pontos.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-emerald-400 mb-1">Pontos Fortes</p>
                                  <ul className="text-sm space-y-1">
                                    {pontos.map((p, i) => <li key={i} className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{p}</li>)}
                                  </ul>
                                </div>
                              )}
                              {areas.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-amber-400 mb-1">Áreas para Melhorar</p>
                                  <ul className="text-sm space-y-1">
                                    {areas.map((a, i) => <li key={i} className="flex items-start gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 flex-shrink-0" />{a}</li>)}
                                  </ul>
                                </div>
                              )}
                              {exercicio && (
                                <div>
                                  <p className="text-xs font-medium text-blue-400 mb-1">Exercício Recomendado</p>
                                  <p className="text-sm">{exercicio}</p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {sub.feedback.suggestions && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Sugestões</p>
                            <p className="text-sm whitespace-pre-wrap">{sub.feedback.suggestions}</p>
                          </div>
                        )}
                        {sub.notes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Suas Observações</p>
                            <p className="text-sm italic">{sub.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {expandedSubmission === sub.id && !sub.feedback && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">Feedback ainda não disponível.</p>
                      </div>
                    )}
                  </div>
                ))}

                {/* Pagination */}
                {history.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-xs text-muted-foreground">
                      Página {history.page} de {history.totalPages} ({history.total} práticas)
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchHistory(historyPage - 1)}
                        disabled={historyPage <= 1 || historyLoading}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchHistory(historyPage + 1)}
                        disabled={historyPage >= history.totalPages || historyLoading}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* ═══ PROGRESS SECTION ═══ */}
      {mainSection === "progress" && <ProgressSection />}
      </div>
    </div>
  );
}

/* ─── ProgressSection ─── */
function ProgressSection() {
  const [submissions, setSubmissions] = useState<SubmissionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30>(30);

  useEffect(() => {
    fetch("/api/music-coach/history?all=true")
      .then((r) => r.json())
      .then((d) => setSubmissions(d.submissions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const cutoff = new Date(now.getTime() - period * 24 * 60 * 60 * 1000);
  const filtered = submissions.filter((s) => new Date(s.createdAt) >= cutoff);

  // Gráfico — agrupar por data
  const chartData = filtered
    .filter((s) => s.feedback?.score != null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((s) => ({
      date: new Date(s.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      vocal: s.type === "vocal" ? s.feedback!.score : null,
      instrumental: s.type === "instrumental" ? s.feedback!.score : null,
    }));

  // Badges
  const totalCount = submissions.length;
  const scores = submissions.filter((s) => s.feedback?.score != null).map((s) => s.feedback!.score!);
  const first3avg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / Math.max(scores.slice(0, 3).length, 1);
  const last3avg = scores.slice(-3).reduce((a, b) => a + b, 0) / Math.max(scores.slice(-3).length, 1);

  const badges = [
    { id: "first", icon: "🎵", label: "Primeira Prática", desc: "Enviou a primeira prática", earned: totalCount >= 1 },
    { id: "five", icon: "🏅", label: "5 Práticas", desc: "Completou 5 práticas", earned: totalCount >= 5 },
    { id: "score80", icon: "⭐", label: "Nota 80+", desc: "Atingiu nota 80 ou mais", earned: scores.some((s) => s >= 80) },
    { id: "score90", icon: "🏆", label: "Nota 90+", desc: "Atingiu nota 90 ou mais", earned: scores.some((s) => s >= 90) },
    { id: "improve", icon: "📈", label: "Evolução 10pts", desc: "Melhorou 10 pontos na média", earned: scores.length >= 6 && last3avg - first3avg >= 10 },
  ];

  // Meta semanal
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const thisWeek = submissions.filter((s) => new Date(s.createdAt) >= weekStart).length;
  const weekGoal = 3;
  const weekProgress = Math.min(thisWeek / weekGoal, 1);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Gráfico */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Evolução de Notas</CardTitle>
            <div className="flex gap-1">
              {([7, 30] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={cn("px-3 py-1 text-xs rounded-full border transition-colors", period === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {p} dias
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma prática com nota no período selecionado.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="vocal" name="Vocal" stroke="#14b8a6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="instrumental" name="Instrumental" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /> Conquistas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {badges.map((b) => (
              <div key={b.id} className={cn("flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all", b.earned ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-50")}>
                <span className="text-2xl">{b.icon}</span>
                <p className={cn("text-xs font-semibold", b.earned ? "text-foreground" : "text-muted-foreground")}>{b.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{b.desc}</p>
                {b.earned && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Meta semanal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Meta Semanal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{thisWeek} de {weekGoal} práticas esta semana</span>
            <span className={cn("font-semibold", thisWeek >= weekGoal ? "text-emerald-400" : "text-primary")}>{Math.round(weekProgress * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", thisWeek >= weekGoal ? "bg-emerald-400" : "bg-primary")} style={{ width: `${weekProgress * 100}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {thisWeek === 0 ? "Comece sua primeira prática da semana! 💪" : thisWeek < weekGoal ? `Faltam ${weekGoal - thisWeek} prática${weekGoal - thisWeek > 1 ? "s" : ""} para atingir a meta! 🎯` : "Meta da semana atingida! Parabéns! 🎉"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
