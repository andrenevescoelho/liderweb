"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Plus, Send, Trash2, RefreshCw, Eye, Clock, CheckCircle,
  XCircle, AlertCircle, Users, ChevronDown, ChevronUp, Play,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  title: string;
  subject: string;
  htmlBody: string;
  segment: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failCount: number;
  createdAt: string;
  _count?: { logs: number };
}

const SEGMENTS: Record<string, { label: string; description: string }> = {
  ALL_ADMINS:     { label: "Todos os admins",          description: "Admin de cada ministério cadastrado" },
  NO_SUBSCRIPTION:{ label: "Sem assinatura",           description: "Ministérios sem plano ativo" },
  INACTIVE_7D:    { label: "Inativos 7 dias",          description: "Grupos sem acesso há 7+ dias" },
  INACTIVE_15D:   { label: "Inativos 15 dias",         description: "Grupos sem acesso há 15+ dias" },
  NO_GROUP:       { label: "Usuários sem ministério",  description: "Cadastrados mas sem grupo" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "Rascunho",   color: "text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> },
  scheduled: { label: "Agendado",  color: "text-blue-500",         icon: <Clock className="h-3.5 w-3.5" /> },
  sending:   { label: "Enviando",  color: "text-yellow-500",       icon: <Send className="h-3.5 w-3.5 animate-pulse" /> },
  sent:      { label: "Enviado",   color: "text-green-500",        icon: <CheckCircle className="h-3.5 w-3.5" /> },
  failed:    { label: "Com falhas", color: "text-red-500",         icon: <XCircle className="h-3.5 w-3.5" /> },
};

// ── Triggers automáticos ─────────────────────────────────────────────────────

const AUTO_TRIGGERS = [
  { type: "inactive_7d",    label: "Grupos inativos 7 dias",    icon: "📅" },
  { type: "inactive_15d",   label: "Grupos inativos 15 dias",   icon: "⚠️" },
  { type: "no_subscription",label: "Grupos sem assinatura",     icon: "🔔" },
  { type: "no_group_user",  label: "Usuários sem ministério",   icon: "👤" },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function CampaignsAdminPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{ label: string; targets: string[]; sent: number; isReal?: boolean; skipped?: number; failed?: number } | null>(null);
  const [autoSentCount, setAutoSentCount] = useState(0);

  // Formulário
  const [form, setForm] = useState({
    title: "", subject: "", htmlBody: "", segment: "ALL_ADMINS", scheduledAt: "",
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/internal/campaign");
      if (res.ok) setCampaigns(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function handleCreate() {
    if (!form.title || !form.subject || !form.htmlBody) {
      toast.error("Preencha título, assunto e corpo do e-mail");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch("/api/internal/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduledAt: form.scheduledAt || null,
        }),
      });
      if (res.ok) {
        toast.success("Campanha criada!");
        setShowForm(false);
        setForm({ title: "", subject: "", htmlBody: "", segment: "ALL_ADMINS", scheduledAt: "" });
        fetchCampaigns();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Erro ao criar");
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleSend(id: string, title: string) {
    if (!confirm(`Enviar campanha "${title}" agora? Esta ação não pode ser desfeita.`)) return;
    setSending(id);
    try {
      const res = await fetch("/api/internal/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "send" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchCampaigns();
      } else {
        toast.error(data.error ?? "Erro ao enviar");
      }
    } finally {
      setSending(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta campanha?")) return;
    const res = await fetch("/api/internal/campaign", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { toast.success("Removida!"); fetchCampaigns(); }
    else { const d = await res.json(); toast.error(d.error ?? "Erro"); }
  }

  async function handleTrigger(type: string, label: string, dryRun = false) {
    const key = dryRun ? `dry_${type}` : type;
    setTriggerLoading(key);
    try {
      const res = await fetch("/api/admin/email-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, dryRun }),
      });
      const data = await res.json();
      if (res.ok) {
        if (dryRun) {
          setDryRunResult({ label, targets: data.targets ?? [], sent: data.sent ?? 0 });
        } else {
          setAutoSentCount(prev => prev + (data.sent ?? 0));
          setDryRunResult({
            label,
            targets: data.targets ?? [],
            sent: data.sent ?? 0,
            isReal: true,
            skipped: data.skipped ?? 0,
            failed: data.failed ?? 0,
          });
        }
      } else {
        toast.error(data.error ?? "Erro");
      }
    } finally {
      setTriggerLoading(null);
    }
  }

  const stats = {
    total: campaigns.length,
    sent: campaigns.filter((c) => c.status === "sent").length,
    scheduled: campaigns.filter((c) => c.status === "scheduled").length,
    totalSent: campaigns.reduce((acc, c) => acc + c.sentCount, 0),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">E-mails de Marketing</h1>
          <p className="text-sm text-muted-foreground mt-1">Campanhas e e-mails automáticos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchCampaigns} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-4 w-4" />Atualizar
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus className="h-4 w-4" />Nova campanha
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Campanhas", value: stats.total },
          { label: "Enviadas", value: stats.sent, color: "text-green-500" },
          { label: "Agendadas", value: stats.scheduled, color: "text-blue-500" },
          { label: "E-mails enviados", value: stats.totalSent + autoSentCount, color: "text-purple-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* E-mails automáticos */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          Disparos automáticos
          <span className="text-xs text-muted-foreground font-normal ml-1">— normalmente chamados pelo n8n, mas podem ser forçados aqui</span>
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {AUTO_TRIGGERS.map((t) => (
            <div key={t.type} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <span>{t.icon}</span>
                <span className="text-sm font-medium">{t.label}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleTrigger(t.type, t.label, true)}
                  disabled={!!triggerLoading}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted disabled:opacity-50"
                >
                  {triggerLoading === `dry_${t.type}` ? "..." : <><Eye className="h-3 w-3 inline mr-1" />Simular</>}
                </button>
                <button
                  onClick={() => handleTrigger(t.type, t.label, false)}
                  disabled={!!triggerLoading}
                  className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-500/10 disabled:opacity-50"
                >
                  {triggerLoading === t.type ? "..." : <><Play className="h-3 w-3 inline mr-1" />Enviar</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Formulário nova campanha */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold">Nova campanha</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Título interno</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex: Promoção Black Friday 2026"
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Assunto <span className="text-muted-foreground/60">(use {`{{nome}}`} e {`{{ministerio}}`})</span>
              </label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ex: {{nome}}, aproveite 30% off no Líder Web!"
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Segmento</label>
              <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(SEGMENTS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label} — {v.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Agendar para (opcional)</label>
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Corpo do e-mail (HTML) <span className="text-muted-foreground/60">— use {`{{nome}}`}, {`{{ministerio}}`}, {`{{app_url}}`}</span>
              </label>
              <textarea value={form.htmlBody} onChange={(e) => setForm({ ...form, htmlBody: e.target.value })}
                placeholder="<p>Olá {{nome}}, temos uma novidade para o {{ministerio}}...</p>"
                rows={6}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancelar</button>
            <button onClick={handleCreate} disabled={formLoading}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {formLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {form.scheduledAt ? "Agendar" : "Salvar como rascunho"}
            </button>
          </div>
        </div>
      )}

      {/* Lista de campanhas */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const status = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
            const seg = SEGMENTS[c.segment];
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20"
                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.title}</span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                        {status.icon}{status.label}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        <Users className="h-3 w-3 inline mr-1" />{seg?.label ?? c.segment}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</span>
                      {c.sentAt && (
                        <span className="text-xs text-muted-foreground">
                          Enviado {format(new Date(c.sentAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {c.scheduledAt && c.status === "scheduled" && (
                        <span className="text-xs text-blue-500">
                          Agendado {format(new Date(c.scheduledAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      {c.sentCount > 0 && (
                        <span className="text-xs text-green-500">{c.sentCount} enviados</span>
                      )}
                      {c.failCount > 0 && (
                        <span className="text-xs text-red-500">{c.failCount} falhas</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSend(c.id, c.title); }}
                        disabled={sending === c.id}
                        className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        {sending === c.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Enviar agora
                      </button>
                    )}
                    {c.status !== "sent" && c.status !== "sending" && (
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                        className="text-muted-foreground hover:text-red-500 p-1.5 rounded hover:bg-red-500/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {expandedId === c.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {expandedId === c.id && (
                  <div className="border-t border-border p-4 space-y-3 bg-muted/20">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Preview do assunto</p>
                      <p className="text-sm">{c.subject}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Corpo (HTML)</p>
                      <pre className="text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap">{c.htmlBody}</pre>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criado em {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Modal dry run */}
      {dryRunResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              {dryRunResult.isReal ? (
                <><CheckCircle className="h-5 w-5 text-green-500" />Envio concluído — {dryRunResult.label}</>
              ) : (
                <><Eye className="h-5 w-5 text-blue-500" />Simulação — {dryRunResult.label}</>
              )}
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-500 font-medium">✓ {dryRunResult.sent} {dryRunResult.isReal ? "enviado(s)" : "seriam enviados"}</span>
              {(dryRunResult.skipped ?? 0) > 0 && <span className="text-muted-foreground">⏭ {dryRunResult.skipped} ignorado(s)</span>}
              {(dryRunResult.failed ?? 0) > 0 && <span className="text-red-500">✗ {dryRunResult.failed} falhou</span>}
            </div>
            {dryRunResult.targets.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {dryRunResult.isReal ? "E-mails enviados para:" : "Destinatários que seriam afetados:"}
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-3 bg-muted/30">
                  {dryRunResult.targets.map((t, i) => (
                    <div key={i} className="text-sm font-mono text-foreground">{t}</div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhum destinatário encontrado para este critério.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDryRunResult(null)}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">
                Fechar
              </button>
              {!dryRunResult.isReal && dryRunResult.sent > 0 && (
                <button onClick={() => {
                  setDryRunResult(null);
                  const trigger = AUTO_TRIGGERS.find(t => t.label === dryRunResult.label);
                  if (trigger) handleTrigger(trigger.type, trigger.label, false);
                }}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
                  <Send className="h-3.5 w-3.5" />Confirmar envio
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
