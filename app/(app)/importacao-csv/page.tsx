"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2, FileDown, FileUp, Loader2, ShieldAlert, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ImportType = "members" | "songs";
type ImportMode = "validate" | "create" | "create_or_update";

interface PreviewRow {
  line: number;
  valid: boolean;
  warnings: string[];
  errors: string[];
  raw: Record<string, string>;
}

interface PreviewResponse {
  jobId: string;
  jobStatus?: "VALIDATED" | "COMPLETED";
  execution?: {
    totalRows: number;
    successRows: number;
    updatedRows: number;
    ignoredRows: number;
    errorRows: number;
  };
  importType: ImportType;
  mode: ImportMode;
  filename: string;
  headers: string[];
  unknownHeaders: string[];
  missingRequiredHeaders: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  rows: PreviewRow[];
}

export default function CsvImportPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canAccess = role === "SUPERADMIN" || role === "ADMIN";

  const [importType, setImportType] = useState<ImportType>("members");
  const [mode, setMode] = useState<ImportMode>("validate");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!canAccess) return;
    fetch("/api/imports/history")
      .then((response) => response.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  }, [canAccess]);

  const previewColumns = useMemo(() => {
    if (!preview?.rows?.length) return [];
    return Object.keys(preview.rows[0].raw ?? {});
  }, [preview]);

  const downloadTemplate = async () => {
    const response = await fetch(`/api/imports/templates?type=${importType}`);
    if (!response.ok) {
      setMessage("Não foi possível baixar o modelo CSV.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = importType === "members" ? "modelo-importacao-membros.csv" : "modelo-importacao-musicas.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleValidate = async () => {
    if (!file) {
      setMessage("Selecione um arquivo CSV antes de processar.");
      return;
    }

    setLoading(true);
    setMessage("");
    setPreview(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importType", importType);
      formData.append("mode", mode);

      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || "Falha ao validar CSV.");
        return;
      }

      setPreview(data);

      if (data?.jobStatus === "COMPLETED" && data?.execution) {
        setMessage(
          `Importação concluída automaticamente. Processado: ${data.execution.totalRows}, criados: ${data.execution.successRows}, atualizados: ${data.execution.updatedRows}, ignorados: ${data.execution.ignoredRows}, erros: ${data.execution.errorRows}.`
        );
        fetch("/api/imports/history")
          .then((historyResponse) => historyResponse.json())
          .then((historyData) => setHistory(Array.isArray(historyData) ? historyData : []))
          .catch(() => undefined);
      }
    } catch (error) {
      setMessage("Erro inesperado ao validar importação.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.jobId) return;
    setConfirming(true);
    setMessage("");

    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: preview.jobId }),
      });

      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.error || "Falha ao confirmar importação.");
        return;
      }

      setMessage(
        `Importação concluída. Processado: ${data.totalRows}, criados: ${data.successRows}, atualizados: ${data.updatedRows}, ignorados: ${data.ignoredRows}, erros: ${data.errorRows}.`
      );
    } catch {
      setMessage("Erro inesperado ao confirmar importação.");
    } finally {
      setConfirming(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <Card>
          <CardContent className="p-10 text-center space-y-4">
            <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="text-xl font-semibold">Acesso negado</h1>
            <p className="text-sm text-muted-foreground">Somente ADMIN e SUPERADMIN podem acessar a importação CSV.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
            <Table className="w-5 h-5 text-cyan-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Importação CSV</h1>
            <p className="text-sm text-muted-foreground">Valide e importe dados em lote para o sistema</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Valide o arquivo antes de salvar e confirme a importação somente após revisar erros e avisos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração da importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={importType}
              onChange={(e) => setImportType(e.target.value as ImportType)}
              options={[
                { value: "members", label: "Membros" },
                { value: "songs", label: "Músicas" },
              ]}
            />
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as ImportMode)}
              options={[
                { value: "validate", label: "Somente validar" },
                { value: "create", label: "Somente criar" },
                { value: "create_or_update", label: "Criar ou atualizar" },
              ]}
            />
            <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <FileDown className="mr-2 h-4 w-4" /> Baixar modelo CSV
            </Button>
            <Button onClick={handleValidate} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              Processar arquivo
            </Button>
            <Button
              variant="secondary"
              onClick={handleConfirmImport}
              disabled={confirming || !preview || mode === "validate" || preview.validRows === 0 || preview.jobStatus === "COMPLETED"}
            >
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmar importação
            </Button>
          </div>
        </CardContent>
      </Card>

      {message && (
        <Card>
          <CardContent className="p-4 text-sm">{message}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico recente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma importação registrada.</p>
          ) : (
            history.slice(0, 10).map((job) => (
              <div key={job.id} className="rounded border p-2">
                <div className="font-medium">{job.importType} • {job.mode} • {job.status}</div>
                <div className="text-muted-foreground">
                  Arquivo: {job.filename} | Total: {job.totalRows} | Sucesso: {job.successRows} | Erros: {job.errorRows}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumo da validação</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
              <div><span className="font-semibold">Total:</span> {preview.totalRows}</div>
              <div><span className="font-semibold text-emerald-600">Válidas:</span> {preview.validRows}</div>
              <div><span className="font-semibold text-amber-600">Avisos:</span> {preview.warningRows}</div>
              <div><span className="font-semibold text-red-600">Erros:</span> {preview.errorRows}</div>
              {!!preview.missingRequiredHeaders.length && (
                <div className="md:col-span-4 text-red-600">Colunas obrigatórias ausentes: {preview.missingRequiredHeaders.join(", ")}</div>
              )}
              {!!preview.unknownHeaders.length && (
                <div className="md:col-span-4 text-amber-600">Colunas desconhecidas: {preview.unknownHeaders.join(", ")}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Table className="h-4 w-4" /> Pré-visualização e erros por linha</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-2 text-left">Linha</th>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Mensagens</th>
                    {previewColumns.map((column) => (
                      <th key={column} className="px-2 py-2 text-left">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((row) => (
                    <tr key={row.line} className="border-b align-top">
                      <td className="px-2 py-2">{row.line}</td>
                      <td className="px-2 py-2">
                        {row.valid ? (
                          <span className="inline-flex items-center text-emerald-600"><CheckCircle2 className="mr-1 h-4 w-4" /> válida</span>
                        ) : (
                          <span className="inline-flex items-center text-red-600"><AlertTriangle className="mr-1 h-4 w-4" /> inválida</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {[...row.errors, ...row.warnings].map((message, idx) => (
                          <div key={idx} className={idx < row.errors.length ? "text-red-600" : "text-amber-600"}>{message}</div>
                        ))}
                      </td>
                      {previewColumns.map((column) => (
                        <td key={column} className="px-2 py-2 whitespace-nowrap">{row.raw?.[column] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
