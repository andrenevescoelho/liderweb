"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  const [settings, setSettings] = useState<any>(null);

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

    if (accessData.canConfigure) {
      const cfg = await fetch("/api/professor/settings");
      if (cfg.ok) setSettings(await cfg.json());
    }
  };

  useEffect(() => {
    load();
  }, []);

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

  const sortedMembers = useMemo(() => (settings?.members ?? []).slice().sort((a: any, b: any) => a.name.localeCompare(b.name)), [settings]);

  const saveSettings = async () => {
    const selectedIds = sortedMembers.filter((member: any) => member.enabled).map((member: any) => member.id);

    const res = await fetch("/api/professor/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: Boolean(settings?.enabled),
        accessMode: settings?.accessMode ?? "SELECTED_MEMBERS",
        memberIds: selectedIds,
      }),
    });

    if (!res.ok) {
      alert("Não foi possível salvar as configurações");
      return;
    }

    await load();
    alert("Configurações do módulo Professor salvas.");
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
            <CardDescription>Resumo da sua evolução recente e foco atual.</CardDescription>
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
          <CardDescription>Formatos aceitos: mp3, wav e m4a (até 20MB).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm">
            <Select value={practiceType} onValueChange={setPracticeType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VOCAL">Canto</SelectItem>
                <SelectItem value="INSTRUMENT">Instrumento</SelectItem>
                <SelectItem value="MINISTRATION">Ministração</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input
            type="file"
            accept=".mp3,.wav,.m4a,audio/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleUpload(file);
              event.currentTarget.value = "";
            }}
          />
          {uploading ? <p className="text-sm text-muted-foreground">Enviando gravação para análise...</p> : null}
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

      {access.canConfigure && settings && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração do módulo (Admin)</CardTitle>
            <CardDescription>Defina quem pode acessar o módulo Professor neste ministério.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="professor-enabled">Habilitar módulo Professor</Label>
              <Switch id="professor-enabled" checked={Boolean(settings.enabled)} onCheckedChange={(value) => setSettings((prev: any) => ({ ...prev, enabled: value }))} />
            </div>

            <div className="max-w-sm">
              <Label>Escopo de acesso</Label>
              <Select value={settings.accessMode} onValueChange={(value) => setSettings((prev: any) => ({ ...prev, accessMode: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL_MEMBERS">Todos os membros</SelectItem>
                  <SelectItem value="SELECTED_MEMBERS">Somente membros selecionados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.accessMode === "SELECTED_MEMBERS" ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Membros habilitados</p>
                {sortedMembers.map((member: any) => (
                  <label key={member.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(member.enabled)}
                      onCheckedChange={(checked) => {
                        setSettings((prev: any) => ({
                          ...prev,
                          members: prev.members.map((item: any) => (item.id === member.id ? { ...item, enabled: checked === true } : item)),
                        }));
                      }}
                    />
                    <span>{member.name}</span>
                    <span className="text-xs text-muted-foreground">({member.memberFunction ?? member.role})</span>
                  </label>
                ))}
              </div>
            ) : null}

            <Button onClick={saveSettings}>Salvar configuração</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
