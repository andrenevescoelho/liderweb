"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Plus, Send, Trash2, RefreshCw, Eye, Clock, CheckCircle,
  XCircle, AlertCircle, Users, ChevronDown, ChevronUp, Play,
  Pencil, RotateCcw, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Campaign {
  id: string; title: string; subject: string; htmlBody: string; segment: string;
  status: string; scheduledAt: string | null; sentAt: string | null;
  sentCount: number; failCount: number; createdAt: string; _count?: { logs: number };
}

interface EmailTemplate {
  type: string; label: string; subject: string; htmlBody: string;
  isCustomized: boolean; updatedAt: string | null;
}

const SEGMENTS: Record<string, { label: string; description: string }> = {
  ALL_ADMINS:      { label: "Todos os admins",         description: "Admin de cada ministério cadastrado" },
  NO_SUBSCRIPTION: { label: "Sem assinatura",          description: "Ministérios sem plano ativo" },
  INACTIVE_7D:     { label: "Inativos 7 dias",         description: "Grupos sem acesso há 7+ dias" },
  INACTIVE_15D:    { label: "Inativos 15 dias",        description: "Grupos sem acesso há 15+ dias" },
  NO_GROUP:        { label: "Usuários sem ministério", description: "Cadastrados mas sem grupo" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:     { label: "Rascunho",    color: "text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> },
  scheduled: { label: "Agendado",   color: "text-blue-500",         icon: <Clock className="h-3.5 w-3.5" /> },
  sending:   { label: "Enviando",   color: "text-yellow-500",       icon: <Send className="h-3.5 w-3.5 animate-pulse" /> },
  sent:      { label: "Enviado",    color: "text-green-500",        icon: <CheckCircle className="h-3.5 w-3.5" /> },
  failed:    { label: "Com falhas", color: "text-red-500",          icon: <XCircle className="h-3.5 w-3.5" /> },
};

const AUTO_TRIGGERS = [
  { type: "inactive_7d",     label: "Grupos inativos 7 dias",       icon: "📅" },
  { type: "inactive_15d",    label: "Grupos inativos 15 dias",      icon: "⚠️" },
  { type: "no_subscription", label: "Grupos sem assinatura",        icon: "🔔" },
  { type: "no_group_user",   label: "Usuários sem ministério",      icon: "👤" },
  { type: "trial_day1",      label: "Trial — Dia 1 (boas-vindas)",  icon: "🚀" },
  { type: "trial_day3",      label: "Trial — Dia 3 (dica da IA)",   icon: "🤖" },
  { type: "trial_day6",      label: "Trial — Dia 6 (expira amanhã)",icon: "⏰" },
];

const VARS_HINT = "Variáveis: {{nome}}, {{ministerio}}, {{app_url}}";

export default function CampaignsAdminPage() {
  const [tab, setTab] = useState<"campaigns" | "templates">("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", subject: "", htmlBody: "", segment: "ALL_ADMINS", scheduledAt: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject: "", htmlBody: "" });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [autoSentCount, setAutoSentCount] = useState(0);
  const [dryRunResult, setDryRunResult] = useState<{ label: string; targets: string[]; sent: number; isReal?: boolean; skipped?: number; failed?: number } | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try { const res = await fetch("/api/internal/campaign"); if (res.ok) setCampaigns(await res.json()); }
    finally { setLoadingCampaigns(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try { const res = await fetch("/api/admin/email-templates"); if (res.ok) setTemplates(await res.json()); }
    finally { setLoadingTemplates(false); }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);
  useEffect(() => { if (tab === "templates") fetchTemplates(); }, [tab, fetchTemplates]);

  function startEditCampaign(c: Campaign) {
    setEditingCampaign(c);
    setForm({ title: c.title, subject: c.subject, htmlBody: c.htmlBody, segment: c.segment, scheduledAt: c.scheduledAt ?? "" });
    setShowForm(true);
  }

  async function handleSaveCampaign() {
    if (!form.title || !form.subject || !form.htmlBody) { toast.error("Preencha todos os campos"); return; }
    setFormLoading(true);
    try {
      const isEdit = !!editingCampaign;
      const res = await fetch("/api/internal/campaign", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: editingCampaign!.id, ...form, scheduledAt: form.scheduledAt || null } : { ...form, scheduledAt: form.scheduledAt || null }),
      });
      if (res.ok) {
        toast.success(isEdit ? "Campanha atualizada!" : "Campanha criada!");
        setShowForm(false); setEditingCampaign(null);
        setForm({ title: "", subject: "", htmlBody: "", segment: "ALL_ADMINS", scheduledAt: "" });
        fetchCampaigns();
      } else { const d = await res.json(); toast.error(d.error ?? "Erro"); }
    } finally { setFormLoading(false); }
  }

  async function handleSend(id: string, title: string) {
    if (!confirm(`Enviar campanha "${title}" agora?`)) return;
    setSending(id);
    try {
      const res = await fetch("/api/internal/campaign", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "send" }) });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); fetchCampaigns(); } else toast.error(data.error ?? "Erro");
    } finally { setSending(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta campanha?")) return;
    const res = await fetch("/api/internal/campaign", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { toast.success("Removida!"); fetchCampaigns(); }
  }

  async function handleTrigger(type: string, label: string, dryRun = false) {
    setTriggerLoading(dryRun ? `dry_${type}` : type);
    try {
      const res = await fetch("/api/admin/email-trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, dryRun }) });
      const data = await res.json();
      if (res.ok) {
        if (dryRun) { setDryRunResult({ label, targets: data.targets ?? [], sent: data.sent ?? 0 }); }
        else { setAutoSentCount(p => p + (data.sent ?? 0)); setDryRunResult({ label, targets: data.targets ?? [], sent: data.sent ?? 0, isReal: true, skipped: data.skipped ?? 0, failed: data.failed ?? 0 }); }
      } else toast.error(data.error ?? "Erro");
    } finally { setTriggerLoading(null); }
  }

  function startEditTemplate(t: EmailTemplate) { setEditingTemplate(t); setTemplateForm({ subject: t.subject, htmlBody: t.htmlBody }); }

  async function handleSaveTemplate() {
    if (!editingTemplate) return;
    setTemplateSaving(true);
    try {
      const res = await fetch("/api/admin/email-templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: editingTemplate.type, ...templateForm }) });
      if (res.ok) { toast.success("Template salvo!"); setEditingTemplate(null); fetchTemplates(); }
      else { const d = await res.json(); toast.error(d.error ?? "Erro"); }
    } finally { setTemplateSaving(false); }
  }

  async function handleRestoreTemplate(type: string) {
    if (!confirm("Restaurar template padrão?")) return;
    const res = await fetch("/api/admin/email-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) });
    if (res.ok) { toast.success("Restaurado!"); fetchTemplates(); }
  }

  const stats = { total: campaigns.length, sent: campaigns.filter(c => c.status === "sent").length, scheduled: campaigns.filter(c => c.status === "scheduled").length, totalSent: campaigns.reduce((a, c) => a + c.sentCount, 0) + autoSentCount };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">E-mails de Marketing</h1><p className="text-sm text-muted-foreground mt-1">Campanhas, disparos automáticos e templates</p></div>
        <button onClick={() => { fetchCampaigns(); fetchTemplates(); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" />Atualizar</button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[{ label: "Campanhas", value: stats.total }, { label: "Enviadas", value: stats.sent, color: "text-green-500" }, { label: "Agendadas", value: stats.scheduled, color: "text-blue-500" }, { label: "E-mails enviados", value: stats.totalSent, color: "text-purple-500" }].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4"><div className={`text-2xl font-bold ${s.color ?? ""}`}>{s.value}</div><div className="text-xs text-muted-foreground mt-1">{s.label}</div></div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-border">
        {[{ key: "campaigns", label: "Campanhas" }, { key: "templates", label: "Templates automáticos" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "campaigns" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 text-yellow-500" />Disparos automáticos<span className="text-xs text-muted-foreground font-normal ml-1">— normalmente chamados pelo n8n</span></h2>
            <div className="grid grid-cols-2 gap-2">
              {AUTO_TRIGGERS.map(t => (
                <div key={t.type} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2"><span>{t.icon}</span><span className="text-sm font-medium">{t.label}</span></div>
                  <div className="flex gap-1">
                    <button onClick={() => handleTrigger(t.type, t.label, true)} disabled={!!triggerLoading} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted disabled:opacity-50">{triggerLoading === `dry_${t.type}` ? "..." : <><Eye className="h-3 w-3 inline mr-1" />Simular</>}</button>
                    <button onClick={() => handleTrigger(t.type, t.label, false)} disabled={!!triggerLoading} className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-500/10 disabled:opacity-50">{triggerLoading === t.type ? "..." : <><Play className="h-3 w-3 inline mr-1" />Enviar</>}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => { setEditingCampaign(null); setForm({ title: "", subject: "", htmlBody: "", segment: "ALL_ADMINS", scheduledAt: "" }); setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"><Plus className="h-4 w-4" />Nova campanha</button>
          </div>

          {showForm && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h2 className="font-semibold">{editingCampaign ? "Editar campanha" : "Nova campanha"}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Título interno</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Promoção Black Friday" className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></div>
                <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Assunto <span className="opacity-60 text-xs">{VARS_HINT}</span></label><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ex: {{nome}}, aproveite 30% off!" className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></div>
                <div><label className="text-xs font-medium text-muted-foreground">Segmento</label><select value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary">{Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}</select></div>
                <div><label className="text-xs font-medium text-muted-foreground">Agendar para (opcional)</label><input type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></div>
                <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground">Corpo HTML <span className="opacity-60 text-xs">{VARS_HINT}</span></label><textarea value={form.htmlBody} onChange={e => setForm({ ...form, htmlBody: e.target.value })} placeholder="<p>Olá {{nome}}...</p>" rows={8} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowForm(false); setEditingCampaign(null); }} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted flex items-center gap-2"><X className="h-4 w-4" />Cancelar</button>
                <button onClick={handleSaveCampaign} disabled={formLoading} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">{formLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editingCampaign ? "Salvar alterações" : form.scheduledAt ? "Agendar" : "Salvar rascunho"}</button>
              </div>
            </div>
          )}

          {loadingCampaigns ? <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div> : campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Mail className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm">Nenhuma campanha criada ainda.</p></div>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => {
                const status = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft;
                const seg = SEGMENTS[c.segment];
                return (
                  <div key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/20" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="font-medium text-sm">{c.title}</span><span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>{status.icon}{status.label}</span><span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full"><Users className="h-3 w-3 inline mr-1" />{seg?.label ?? c.segment}</span></div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground truncate max-w-xs">{c.subject}</span>
                          {c.sentAt && <span className="text-xs text-muted-foreground">Enviado {format(new Date(c.sentAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>}
                          {c.scheduledAt && c.status === "scheduled" && <span className="text-xs text-blue-500">Agendado {format(new Date(c.scheduledAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>}
                          {c.sentCount > 0 && <span className="text-xs text-green-500">{c.sentCount} enviados</span>}
                          {c.failCount > 0 && <span className="text-xs text-red-500">{c.failCount} falhas</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(c.status === "draft" || c.status === "scheduled") && (
                          <>
                            <button onClick={e => { e.stopPropagation(); startEditCampaign(c); }} className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={e => { e.stopPropagation(); handleSend(c.id, c.title); }} disabled={sending === c.id} className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 disabled:opacity-50">{sending === c.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}Enviar agora</button>
                            <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} className="text-muted-foreground hover:text-red-500 p-1.5 rounded hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                        {expandedId === c.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {expandedId === c.id && (
                      <div className="border-t border-border p-4 space-y-3 bg-muted/20">
                        <div><p className="text-xs font-medium text-muted-foreground mb-1">Assunto</p><p className="text-sm">{c.subject}</p></div>
                        <div><p className="text-xs font-medium text-muted-foreground mb-1">Corpo HTML</p><pre className="text-xs bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-40 font-mono whitespace-pre-wrap">{c.htmlBody}</pre></div>
                        <div className="text-xs text-muted-foreground">Criado em {format(new Date(c.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Personalize os e-mails automáticos. Use <code className="bg-muted px-1 rounded text-xs">{"{{nome}}"}</code>, <code className="bg-muted px-1 rounded text-xs">{"{{ministerio}}"}</code> e <code className="bg-muted px-1 rounded text-xs">{"{{app_url}}"}</code> como variáveis.</p>
          {loadingTemplates ? <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div> : (
            <div className="space-y-2">
              {templates.map(t => (
                <div key={t.type} className="rounded-xl border border-border bg-card overflow-hidden">
                  {editingTemplate?.type === t.type ? (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">{t.label}</h3><button onClick={() => setEditingTemplate(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
                      <div><label className="text-xs font-medium text-muted-foreground">Assunto</label><input value={templateForm.subject} onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" /></div>
                      <div><label className="text-xs font-medium text-muted-foreground">Corpo HTML</label><textarea value={templateForm.htmlBody} onChange={e => setTemplateForm({ ...templateForm, htmlBody: e.target.value })} rows={10} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary" /></div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingTemplate(null)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted">Cancelar</button>
                        <button onClick={handleSaveTemplate} disabled={templateSaving} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">{templateSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="font-medium text-sm">{t.label}</span>{t.isCustomized && <span className="text-xs bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded-full">Personalizado</span>}</div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                        {t.updatedAt && <p className="text-xs text-muted-foreground mt-0.5">Atualizado {format(new Date(t.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-3">
                        <button onClick={() => startEditTemplate(t)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"><Pencil className="h-3 w-3" />Editar</button>
                        {t.isCustomized && <button onClick={() => handleRestoreTemplate(t.type)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-500 px-2 py-1 rounded hover:bg-orange-500/10"><RotateCcw className="h-3 w-3" />Restaurar padrão</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {dryRunResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              {dryRunResult.isReal ? <><CheckCircle className="h-5 w-5 text-green-500" />Envio concluído — {dryRunResult.label}</> : <><Eye className="h-5 w-5 text-blue-500" />Simulação — {dryRunResult.label}</>}
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-500 font-medium">✓ {dryRunResult.sent} {dryRunResult.isReal ? "enviado(s)" : "seriam enviados"}</span>
              {(dryRunResult.skipped ?? 0) > 0 && <span className="text-muted-foreground">⏭ {dryRunResult.skipped} ignorado(s)</span>}
              {(dryRunResult.failed ?? 0) > 0 && <span className="text-red-500">✗ {dryRunResult.failed} falhou</span>}
            </div>
            {dryRunResult.targets.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{dryRunResult.isReal ? "E-mails enviados para:" : "Destinatários que seriam afetados:"}</p>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-3 bg-muted/30">
                  {dryRunResult.targets.map((t, i) => <div key={i} className="text-sm font-mono">{t}</div>)}
                </div>
              </>
            ) : <p className="text-sm text-muted-foreground italic">Nenhum destinatário encontrado.</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDryRunResult(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Fechar</button>
              {!dryRunResult.isReal && dryRunResult.sent > 0 && (
                <button onClick={() => { setDryRunResult(null); const trigger = AUTO_TRIGGERS.find(t => t.label === dryRunResult.label); if (trigger) handleTrigger(trigger.type, trigger.label, false); }} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2"><Send className="h-3.5 w-3.5" />Confirmar envio</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
