"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CheckCircle, Loader2, PlusCircle, Search, Ticket, Trash2, XCircle, AlertCircle } from "lucide-react";

const PLAN_OPTIONS = [
  { value: "BASIC", label: "Básico" },
  { value: "INTERMEDIATE", label: "Intermediário" },
  { value: "ADVANCED", label: "Avançado" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

const TYPE_OPTIONS = [
  { value: "PERCENTAGE_DISCOUNT", label: "Desconto percentual" },
  { value: "FREE_PLAN", label: "Plano gratuito" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "expirado", label: "Expirado" },
  { value: "esgotado", label: "Esgotado" },
];

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  type: "PERCENTAGE_DISCOUNT",
  discountPercent: "",
  freePlanTier: "BASIC",
  freePlanDurationDays: "30",
  isActive: true,
  validFrom: "",
  validUntil: "",
  maxUses: "",
  allowedPlanTiers: [] as string[],
};

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

function validateForm(form: typeof EMPTY_FORM): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.code.trim()) errors.code = "Código é obrigatório";
  else if (!/^[A-Z0-9_-]+$/i.test(form.code.trim())) errors.code = "Use apenas letras, números, _ e -";
  if (!form.name.trim()) errors.name = "Nome é obrigatório";
  if (form.type === "PERCENTAGE_DISCOUNT") {
    const pct = Number(form.discountPercent);
    if (!form.discountPercent) errors.discountPercent = "Percentual é obrigatório";
    else if (isNaN(pct) || pct < 1 || pct > 100) errors.discountPercent = "Percentual deve ser entre 1 e 100";
  }
  if (form.type === "FREE_PLAN") {
    const days = Number(form.freePlanDurationDays);
    if (!form.freePlanDurationDays) errors.freePlanDurationDays = "Duração é obrigatória";
    else if (isNaN(days) || days < 1) errors.freePlanDurationDays = "Duração deve ser pelo menos 1 dia";
  }
  if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
    errors.validUntil = "Data final deve ser após a data inicial";
  }
  if (form.maxUses && (isNaN(Number(form.maxUses)) || Number(form.maxUses) < 1)) {
    errors.maxUses = "Limite de usos deve ser um número positivo";
  }
  return errors;
}

export default function CuponsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [coupons, setCoupons] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isSuperadmin = userRole === "SUPERADMIN";

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    return params.toString();
  }, [search, statusFilter]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/coupons?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar cupons");
      setCoupons(data.coupons || []);
    } catch (error: any) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isSuperadmin) { router.replace("/dashboard"); return; }
    loadCoupons();
  }, [session, status, isSuperadmin, query]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setFieldErrors({}); setFeedback(null); };

  const submitForm = async () => {
    setFeedback(null);
    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFeedback({ type: "error", message: "Corrija os campos destacados antes de salvar." });
      return;
    }
    setFieldErrors({});
    setSaving(true);

    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountPercent: form.discountPercent ? Number(form.discountPercent) : null,
      freePlanDurationDays: form.freePlanDurationDays ? Number(form.freePlanDurationDays) : null,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
    };

    try {
      const res = await fetch(editingId ? `/api/coupons/${editingId}` : "/api/coupons", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Mapear erros da API para campos específicos
        const msg: string = data.error || "Erro ao salvar cupom";
        if (msg.includes("código") || msg.includes("código")) setFieldErrors({ code: msg });
        else if (msg.includes("Percentual")) setFieldErrors({ discountPercent: msg });
        else if (msg.includes("Plano gratuito")) setFieldErrors({ freePlanDurationDays: msg });
        else if (msg.includes("Data")) setFieldErrors({ validUntil: msg });
        throw new Error(msg);
      }
      setFeedback({ type: "success", message: editingId ? "✓ Cupom atualizado com sucesso!" : "✓ Cupom criado com sucesso!" });
      resetForm();
      await loadCoupons();
    } catch (error: any) {
      setFeedback((prev) => prev?.type === "success" ? prev : { type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (coupon: any) => {
    setFeedback(null);
    setFieldErrors({});
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || "",
      type: coupon.type,
      discountPercent: coupon.discountPercent ? String(coupon.discountPercent) : "",
      freePlanTier: coupon.freePlanTier || "BASIC",
      freePlanDurationDays: coupon.freePlanDurationDays ? String(coupon.freePlanDurationDays) : "30",
      isActive: coupon.isActive,
      validFrom: coupon.validFrom ? String(coupon.validFrom).slice(0, 10) : "",
      validUntil: coupon.validUntil ? String(coupon.validUntil).slice(0, 10) : "",
      maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
      allowedPlanTiers: coupon.allowedPlanTiers || [],
    });
  };

  const toggleCoupon = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/coupons/${id}/toggle`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const data = await res.json();
    if (!res.ok) { setFeedback({ type: "error", message: data.error || "Erro ao atualizar status" }); return; }
    await loadCoupons();
  };

  const deleteCoupon = async (coupon: any) => {
    if (!window.confirm(`Tem certeza que deseja excluir o cupom ${coupon.code}?`)) return;
    setDeletingId(coupon.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir cupom");
      if (editingId === coupon.id) resetForm();
      setFeedback({ type: "success", message: `✓ Cupom ${coupon.code} excluído com sucesso.` });
      await loadCoupons();
    } catch (error: any) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isSuperadmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciar Cupons</h1>
        <p className="text-sm text-muted-foreground">Criação e gestão de cupons (somente SUPERADMIN).</p>
      </div>

      {feedback && (
        <Card className={feedback.type === "error" ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/40 bg-emerald-500/5"}>
          <CardContent className={`p-4 text-sm flex items-center gap-2 ${feedback.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
            {feedback.type === "error" ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
            {feedback.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5" />
            {editingId ? "Editar cupom" : "Novo cupom"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Código do cupom" required error={fieldErrors.code}>
            <Input placeholder="Ex: PROMO20, NATAL25" value={form.code} disabled={!!editingId}
              onChange={(e) => { setForm((p) => ({ ...p, code: e.target.value.toUpperCase() })); setFieldErrors((p) => ({ ...p, code: "" })); }}
              className={fieldErrors.code ? "border-red-500/50" : ""} />
          </Field>

          <Field label="Nome do cupom" required error={fieldErrors.name}>
            <Input placeholder="Ex: Promoção de Natal" value={form.name}
              onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFieldErrors((p) => ({ ...p, name: "" })); }}
              className={fieldErrors.name ? "border-red-500/50" : ""} />
          </Field>

          <Field label="Descrição (opcional)" error={fieldErrors.description}>
            <Input placeholder="Descrição interna do cupom" value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="md:col-span-2" />
          </Field>

          <Field label="Tipo de benefício" required>
            <Select options={TYPE_OPTIONS} value={form.type}
              onChange={(e) => { setForm((p) => ({ ...p, type: e.target.value })); setFieldErrors({}); }} />
          </Field>

          <Field label="Status">
            <Select options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
              value={String(form.isActive)}
              onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "true" }))} />
          </Field>

          {form.type === "PERCENTAGE_DISCOUNT" ? (
            <Field label="Percentual de desconto (%)" required error={fieldErrors.discountPercent}>
              <Input type="number" min={1} max={100} placeholder="Ex: 20 (para 20%)" value={form.discountPercent}
                onChange={(e) => { setForm((p) => ({ ...p, discountPercent: e.target.value })); setFieldErrors((p) => ({ ...p, discountPercent: "" })); }}
                className={fieldErrors.discountPercent ? "border-red-500/50" : ""} />
            </Field>
          ) : (
            <>
              <Field label="Plano gratuito concedido" required>
                <Select options={PLAN_OPTIONS} value={form.freePlanTier}
                  onChange={(e) => setForm((p) => ({ ...p, freePlanTier: e.target.value }))} />
              </Field>
              <Field label="Duração do benefício (dias)" required error={fieldErrors.freePlanDurationDays}>
                <Input type="number" min={1} placeholder="Ex: 30" value={form.freePlanDurationDays}
                  onChange={(e) => { setForm((p) => ({ ...p, freePlanDurationDays: e.target.value })); setFieldErrors((p) => ({ ...p, freePlanDurationDays: "" })); }}
                  className={fieldErrors.freePlanDurationDays ? "border-red-500/50" : ""} />
              </Field>
            </>
          )}

          <Field label="Válido a partir de (Data inicial)" error={fieldErrors.validFrom}>
            <Input type="date" value={form.validFrom}
              onChange={(e) => { setForm((p) => ({ ...p, validFrom: e.target.value })); setFieldErrors((p) => ({ ...p, validFrom: "", validUntil: "" })); }} />
          </Field>

          <Field label="Válido até (Data final)" error={fieldErrors.validUntil}>
            <Input type="date" value={form.validUntil}
              onChange={(e) => { setForm((p) => ({ ...p, validUntil: e.target.value })); setFieldErrors((p) => ({ ...p, validUntil: "" })); }}
              className={fieldErrors.validUntil ? "border-red-500/50" : ""} />
          </Field>

          <Field label="Limite de usos (deixe vazio para ilimitado)" error={fieldErrors.maxUses}>
            <Input type="number" min={1} placeholder="Ex: 100" value={form.maxUses}
              onChange={(e) => { setForm((p) => ({ ...p, maxUses: e.target.value })); setFieldErrors((p) => ({ ...p, maxUses: "" })); }}
              className={fieldErrors.maxUses ? "border-red-500/50" : ""} />
          </Field>

          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Restringir a planos específicos <span className="text-muted-foreground/50">(opcional — deixe vazio para todos os planos)</span></p>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((plan) => {
                const selected = form.allowedPlanTiers.includes(plan.value);
                return (
                  <Button key={plan.value} type="button" size="sm" variant={selected ? "default" : "outline"}
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      allowedPlanTiers: selected
                        ? prev.allowedPlanTiers.filter((v) => v !== plan.value)
                        : [...prev.allowedPlanTiers, plan.value],
                    }))}>
                    {plan.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <Button onClick={submitForm} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingId ? "Salvar alterações" : "Criar cupom"}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancelar edição</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ticket className="w-5 h-5" />Cupons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por código ou nome" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select options={STATUS_OPTIONS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Carregando cupons...</div>
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => (
                <Card key={coupon.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-semibold">{coupon.code} • {coupon.name}</p>
                        <p className="text-sm text-muted-foreground">{coupon.benefitSummary}</p>
                        <p className="text-xs text-muted-foreground">Usos: {coupon.usedCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : " (ilimitado)"}</p>
                        {coupon.validFrom && <p className="text-xs text-muted-foreground">De: {new Date(coupon.validFrom).toLocaleDateString("pt-BR")} {coupon.validUntil ? `até ${new Date(coupon.validUntil).toLocaleDateString("pt-BR")}` : ""}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={coupon.computedStatus === "ativo" ? "success" : "outline"}>{coupon.computedStatus}</Badge>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(coupon)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleCoupon(coupon.id, coupon.isActive)}>
                          {coupon.isActive ? <><XCircle className="w-4 h-4 mr-1" />Desativar</> : <><CheckCircle className="w-4 h-4 mr-1" />Ativar</>}
                        </Button>
                        <Button size="sm" variant="destructive" disabled={deletingId === coupon.id} onClick={() => deleteCoupon(coupon)}>
                          {deletingId === coupon.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!coupons.length && <p className="text-sm text-muted-foreground">Nenhum cupom encontrado.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

