"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

type AccessInfo = { enabled: boolean; canConfigure: boolean };

type DashboardData = {
  roleType: string;
  instrument?: string | null;
  avgScore?: number | null;
  strengths: string[];
  improvements: string[];
  recentSubmissions: Array<any>;
};

export default function ProfessorPage() {
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [contents, setContents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [practiceType, setPracticeType] = useState("VOCAL");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorderSupported, setRecorderSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const load = async () => {
    const accessRes = await fetch("/api/professor/access");
    if (!accessRes.ok) return;
    const accessData = await accessRes.json();
    setAccess(accessData);

    if (!accessData.enabled && !accessData.canConfigure) return;

    const [d, c, s] = await Promise.all([
      fetch("/api/professor/dashboard").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/professor/contents").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/professor/submissions").then((r) => (r.ok ? r.json() : [])),
    ]);

    if (d) setDashboard(d);
    setContents(c?.contents ?? []);
    setSubmissions(s ?? []);

  };

  useEffect(() => {
    setRecorderSupported(typeof window !== "undefined" && "MediaRecorder" in window && !!navigator?.mediaDevices?.getUserMedia);
    load();
  }, []);

  const handleRecordedBlob = async (blob: Blob) => {
    const extension = blob.type.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `gravacao-professor-${Date.now()}.${extension}`, {
      type: blob.type || "audio/webm",
    });
    await handleUpload(file);
  };

  const startRecording = async () => {
    try {
      if (!recorderSupported) {
        alert("Seu navegador não suporta gravação de áudio neste recurso.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          await handleRecordedBlob(blob);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (error) {
      console.error("Erro ao iniciar gravação:", error);
      alert("Não foi possível iniciar a gravação. Verifique permissões de microfone.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    setRecording(false);
  };

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);

      const uploadRes = await fetch("/api/professor/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });

      if (!uploadRes.ok) throw new Error("Falha ao preparar upload");
      const uploadData = await uploadRes.json();

      const putRes = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) throw new Error("Falha ao enviar arquivo para o R2");

      const submissionRes = await fetch("/api/professor/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: practiceType,
          fileName: file.name,
          fileKey: uploadData.fileKey,
          fileUrl: uploadData.fileUrl,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      if (!submissionRes.ok) throw new Error("Falha ao registrar submissão");

      await load();
      alert("Gravação enviada e feedback inicial gerado com sucesso.");
    } catch (error: any) {
      alert(error?.message ?? "Erro no envio da gravação");
    } finally {
      setUploading(false);
    }
  };

  if (!access) return <p>Carregando módulo Professor...</p>;
  if (!access.enabled && !access.canConfigure) return <p>O módulo Professor ainda não está habilitado para o seu usuário.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Professor</h1>
        <p className="text-muted-foreground">Acompanhamento musical personalizado para evolução no ministério.</p>
      </div>

      {dashboard && (
        <Card>
          <CardHeader>
            <CardTitle>Dashboard do Professor</CardTitle>
            <p className="text-sm text-muted-foreground">Resumo da sua evolução recente e foco atual.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Função: {dashboard.roleType}</Badge>
              {dashboard.instrument && <Badge variant="secondary">Instrumento: {dashboard.instrument}</Badge>}
              {dashboard.avgScore ? <Badge variant="outline">Score médio: {dashboard.avgScore}</Badge> : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium">Pontos fortes</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {(dashboard.strengths ?? []).map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium">Pontos a melhorar</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {(dashboard.improvements ?? []).map((item, idx) => <li key={idx}>{item}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Conteúdos recomendados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {contents.map((content: any, idx: number) => (
            <div key={content.id ?? idx} className="rounded-lg border p-3">
              <p className="font-medium">{content.title}</p>
              {content.description ? <p className="text-sm text-muted-foreground">{content.description}</p> : null}
              <Badge variant="outline" className="mt-2">{content.contentType}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enviar gravação</CardTitle>
          <p className="text-sm text-muted-foreground">Formatos aceitos: mp3, wav, m4a, webm e ogg (até 20MB).</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm">
            <Select
              value={practiceType}
              onChange={(event) => setPracticeType(event.target.value)}
              options={[
                { value: "VOCAL", label: "Canto" },
                { value: "INSTRUMENT", label: "Instrumento" },
                { value: "MINISTRATION", label: "Ministração" },
              ]}
            />
          </div>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleUpload(file);
              event.currentTarget.value = "";
            }}
          />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ou grave pelo gravador do dispositivo:</p>
            <input
              type="file"
              accept="audio/*"
              capture="microphone"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {!recording ? (
              <Button type="button" variant="outline" disabled={uploading || !recorderSupported} onClick={startRecording}>
                Gravar áudio no site
              </Button>
            ) : (
              <Button type="button" variant="destructive" disabled={uploading} onClick={stopRecording}>
                Parar gravação e enviar
              </Button>
            )}
            {!recorderSupported ? <p className="text-xs text-muted-foreground">Gravação direta no navegador indisponível aqui. Use o campo de gravação do dispositivo acima.</p> : null}
          </div>
          {uploading ? <p className="text-sm text-muted-foreground">Enviando gravação para análise...</p> : null}
          {recording ? <p className="text-sm text-red-500">Gravando... clique em “Parar gravação e enviar”.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico e evolução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {submissions.map((submission: any) => {
            const feedback = submission.feedbacks?.[0];
            return (
              <div key={submission.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium">{submission.fileName}</p>
                  <Badge variant="secondary">{submission.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(submission.createdAt).toLocaleString("pt-BR")}</p>
                {feedback ? (
                  <>
                    <p className="mt-2 text-sm">{feedback.feedbackText}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Score: {feedback.score ?? "-"}</p>
                  </>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

    </div>
  );
}
