"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Loader2, X, CheckCircle2, Archive,
  CreditCard, Star, Link as LinkIcon, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface GatewayMapping {
  id?: string;
  gateway: string;
  externalId: string;
  isActive: boolean;
}

interface BillingPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  price: number;
  period: string;
  trialDays: number;
  status: string;
  isPopular: boolean;
  badge: string | null;
  sortOrder: number;
  userLimit: number;
  features: Record<string, any>;
  gatewayMappings: GatewayMapping[];
}

const GATEWAY_OPTIONS = ["STRIPE", "ASAAS", "MERCADO_PAGO", "MANUAL"];
const PERIOD_OPTIONS = [
  { value: "MONTHLY", label: "Mensal" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "SEMIANNUAL", label: "Semestral" },
  { value: "ANNUAL", label: "Anual" },
];

const EMPTY_FORM = {
  slug: "", name: "", description: "", tagline: "",
  price: "", period: "MONTHLY", trialDays: "7",
  status: "ACTIVE", isPopular: false, badge: "",
  sortOrder: "0", userLimit: "0",
  features: '{"professor": false, "multitracks": 0, "splits": 0, "audio_upload": false}',
  gatewayMappings: [] as GatewayMapping[],
};

export default function BillingAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = (session?.user as any);

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [featuresError, setFeaturesError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && user?.role !== "SUPERADMIN") {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/plans");
      const data = await res.json();
      setPlans(data.plans ?? []);
    } catch {
      toast.error("Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchPlans();
  }, [status, fetchPlans]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFeaturesError("");
    setShowForm(true);
  };

  const openEdit = (plan: BillingPlan) => {
    setForm({
      slug: plan.slug,
      name: plan.name,
      description: plan.description || "",
      tagline: plan.tagline || "",
      price: String(plan.price),
      period: plan.period,
      trialDays: String(plan.trialDays),
      status: plan.status,
      isPopular: plan.isPopular,
      badge: plan.badge || "",
      sortOrder: String(plan.sortOrder),
      userLimit: String(plan.userLimit),
      features: JSON.stringify(plan.features, null, 2),
      gatewayMappings: plan.gatewayMappings.map(m => ({ ...m })),
    });
    setEditingId(plan.id);
    setFeaturesError("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFeaturesError("");
  };

  const addGatewayMapping = () => {
    setForm(f => ({
      ...f,
      gatewayMappings: [...f.gatewayMappings, { gateway: "STRIPE", externalId: "", isActive: true }],
    }));
  };

  const removeGatewayMapping = (idx: number) => {
    setForm(f => ({ ...f, gatewayMappings: f.gatewayMappings.filter((_, i) => i !== idx) }));
  };

  const updateGatewayMapping = (idx: number, field: string, value: any) => {
    setForm(f => ({
      ...f,
      gatewayMappings: f.gatewayMappings.map((m, i) => i === idx ? { ...m, [field]: value } : m),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeaturesError("");

    let parsedFeatures: any;
    try {
      parsedFeatures = JSON.parse(form.features);
    } catch {
      setFeaturesError("JSON inválido nos features");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        slug: form.slug,
        name: form.name,
        description: form.description || null,
        tagline: form.tagline || null,
        price: Number(form.price),
        period: form.period,
        trialDays: Number(form.trialDays),
        status: form.status,
        isPopular: form.isPopular,
        badge: form.badge || null,
        sortOrder: Number(form.sortOrder),
        userLimit: Number(form.userLimit),
        features: parsedFeatures,
        gatewayMappings: form.gatewayMappings.filter(m => m.externalId),
      };

      const res = await fetch("/api/billing/plans", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao salvar"); return; }

      toast.success(editingId ? "Plano atualizado!" : "Plano criado!");
      closeForm();
      fetchPlans();
    } catch {
      toast.error("Erro ao salvar plano");
    } finally {
      setSaving(false);
    }
  };

  const archivePlan = async (plan: BillingPlan) => {
    if (!confirm(`Arquivar plano "${plan.name}"? Ele ficará oculto mas não será excluído.`)) return;
    try {
      const res = await fetch(`/api/billing/plans?id=${plan.id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Plano arquivado"); fetchPlans(); }
      else toast.error("Erro ao arquivar");
    } catch { toast.error("Erro ao arquivar"); }
  };

  const toggleStatus = async (plan: BillingPlan) => {
    const newStatus = plan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await fetch("/api/billing/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, status: newStatus }),
      });
      if (res.ok) {
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: newStatus } : p));
        toast.success(newStatus === "ACTIVE" ? "Plano ativado" : "Plano desativado");
      }
    } catch { toast.error("Erro ao atualizar status"); }
  };

  const statusBadge = (s: string) => {
    if (s === "ACTIVE") return <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Ativo</span>;
    if (s === "INACTIVE") return <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-1"><X className="h-3 w-3" />Inativo</span>;
    return <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Archive className="h-3 w-3" />Arquivado</span>;
  };

  if (status === "loading" || loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-primary" />
            Planos de Assinatura
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie os planos disponíveis para os clientes.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo Plano</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Nenhum plano cadastrado.</p>
              <Button variant="outline" className="mt-4" onClick={openNew}>Criar primeiro plano</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {plans.map((plan) => (
                <div key={plan.id}>
                  <div className={cn("flex items-center gap-4 px-5 py-4", plan.status === "ARCHIVED" && "opacity-40")}>
                    {/* Ordem */}
                    <div className="w-6 text-center text-sm font-bold text-muted-foreground">{plan.sortOrder}</div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{plan.name}</p>
                        {plan.isPopular && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />}
                        {plan.badge && <span className="text-[10px] bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded font-medium">{plan.badge}</span>}
                        {statusBadge(plan.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{plan.tagline}</p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-primary">
                          {plan.price === 0 ? "Grátis" : `R$ ${plan.price.toFixed(2).replace(".", ",")}/mês`}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {plan.userLimit === 0 ? "Ilimitado" : `${plan.userLimit} membros`}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {plan.trialDays}d trial
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          slug: {plan.slug}
                        </span>
                      </div>
                      {/* Gateways */}
                      {plan.gatewayMappings.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {plan.gatewayMappings.map((m, i) => (
                            <span key={i} className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border font-mono",
                              m.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"
                            )}>
                              {m.gateway}: {m.externalId.slice(0, 20)}{m.externalId.length > 20 ? "…" : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === plan.id ? null : plan.id)} title="Ver features">
                        {expandedId === plan.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {plan.status !== "ARCHIVED" && (
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(plan)}
                          className={plan.status === "ACTIVE" ? "text-amber-400" : "text-emerald-400"}>
                          {plan.status === "ACTIVE" ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => archivePlan(plan)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Features expandido */}
                  {expandedId === plan.id && (
                    <div className="px-5 pb-4 bg-muted/30">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Features</p>
                      <pre className="text-[11px] text-muted-foreground font-mono bg-background rounded-lg p-3 border border-border overflow-auto">
                        {JSON.stringify(plan.features, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeForm}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-lg font-bold">{editingId ? "Editar Plano" : "Novo Plano"}</h2>
              <button onClick={closeForm} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {/* Info básica */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Slug * <span className="text-[10px] text-muted-foreground font-normal">(único, sem espaços)</span></label>
                  <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="ex: basico" required disabled={!!editingId} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Básico" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Preço (R$) *</label>
                  <Input type="number" step="0.01" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="29.90" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Período</label>
                  <select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Limite de membros <span className="text-[10px] text-muted-foreground">(0 = ilimitado)</span></label>
                  <Input type="number" value={form.userLimit}
                    onChange={e => setForm(f => ({ ...f, userLimit: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Dias de trial</label>
                  <Input type="number" value={form.trialDays}
                    onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ordem de exibição</label>
                  <Input type="number" value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Tagline</label>
                  <Input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                    placeholder="ex: Para ministérios em crescimento" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição detalhada do plano" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Badge <span className="text-[10px] text-muted-foreground">(opcional)</span></label>
                  <Input value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}
                    placeholder="ex: Mais Popular" />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <input type="checkbox" id="isPopular" checked={form.isPopular}
                    onChange={e => setForm(f => ({ ...f, isPopular: e.target.checked }))}
                    className="h-4 w-4 rounded" />
                  <label htmlFor="isPopular" className="text-sm font-medium cursor-pointer">Destacar como popular</label>
                </div>
              </div>

              {/* Features JSON */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  Features <span className="text-[10px] text-muted-foreground font-normal">(JSON)</span>
                </label>
                <textarea
                  value={form.features}
                  onChange={e => { setForm(f => ({ ...f, features: e.target.value })); setFeaturesError(""); }}
                  rows={5}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder={'{\n  "professor": true,\n  "multitracks": 3,\n  "splits": 0\n}'}
                />
                {featuresError && <p className="text-xs text-red-400">{featuresError}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Exemplos de chaves: professor (bool), multitracks (número), splits (número), audio_upload (bool)
                </p>
              </div>

              {/* Gateway Mappings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Mapeamentos de Gateway
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={addGatewayMapping}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Adicionar
                  </Button>
                </div>
                {form.gatewayMappings.length === 0 && (
                  <p className="text-[12px] text-muted-foreground">Nenhum gateway configurado. Planos pagos precisam de pelo menos um mapeamento Stripe.</p>
                )}
                {form.gatewayMappings.map((m, idx) => (
                  <div key={idx} className="flex gap-2 items-center rounded-lg border border-border bg-muted/30 p-3">
                    <select value={m.gateway} onChange={e => updateGatewayMapping(idx, "gateway", e.target.value)}
                      className="h-8 rounded border border-border bg-background px-2 text-sm focus:outline-none">
                      {GATEWAY_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <Input value={m.externalId} onChange={e => updateGatewayMapping(idx, "externalId", e.target.value)}
                      placeholder="price_xxx / external_id" className="flex-1 h-8 text-sm font-mono" />
                    <div className="flex items-center gap-1">
                      <input type="checkbox" checked={m.isActive}
                        onChange={e => updateGatewayMapping(idx, "isActive", e.target.checked)}
                        className="h-3.5 w-3.5" title="Ativo" />
                      <span className="text-[11px] text-muted-foreground">ativo</span>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeGatewayMapping(idx)}
                      className="text-red-400 hover:bg-red-500/10 h-8 w-8 p-0">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={closeForm} className="flex-1" disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : editingId ? "Salvar alterações" : "Criar plano"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
