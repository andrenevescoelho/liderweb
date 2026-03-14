"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CheckCircle, Loader2, PlusCircle, Search, Ticket, Trash2, XCircle } from "lucide-react";

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
  const [feedback, setFeedback] = useState<string | null>(null);
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
      setFeedback(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isSuperadmin) {
      router.replace("/dashboard");
      return;
    }
    loadCoupons();
  }, [session, status, isSuperadmin, query]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submitForm = async () => {
    setSaving(true);
    setFeedback(null);

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
      if (!res.ok) throw new Error(data.error || "Erro ao salvar cupom");
      setFeedback(editingId ? "Cupom atualizado com sucesso" : "Cupom criado com sucesso");
      resetForm();
      await loadCoupons();
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (coupon: any) => {
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || "Erro ao atualizar status");
      return;
    }
    await loadCoupons();
  };

  const deleteCoupon = async (coupon: any) => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir o cupom ${coupon.code}?`);
    if (!confirmed) return;

    setDeletingId(coupon.id);
    setFeedback(null);

    try {
      const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao excluir cupom");

      if (editingId === coupon.id) {
        resetForm();
      }

      setFeedback("Cupom excluído com sucesso");
      await loadCoupons();
    } catch (error: any) {
      setFeedback(error.message);
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

      {feedback ? <Card><CardContent className="p-4 text-sm">{feedback}</CardContent></Card> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PlusCircle className="w-5 h-5" />{editingId ? "Editar cupom" : "Novo cupom"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input placeholder="Código (ex: PROMO20)" value={form.code} disabled={!!editingId} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          <Input placeholder="Nome" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Descrição" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="md:col-span-2" />

          <Select options={TYPE_OPTIONS} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} />
          <Select
            options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
            value={String(form.isActive)}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === "true" }))}
          />

          {form.type === "PERCENTAGE_DISCOUNT" ? (
            <Input type="number" placeholder="Percentual de desconto" value={form.discountPercent} onChange={(e) => setForm((p) => ({ ...p, discountPercent: e.target.value }))} />
          ) : (
            <>
              <Select options={PLAN_OPTIONS} value={form.freePlanTier} onChange={(e) => setForm((p) => ({ ...p, freePlanTier: e.target.value }))} />
              <Input type="number" placeholder="Duração (dias)" value={form.freePlanDurationDays} onChange={(e) => setForm((p) => ({ ...p, freePlanDurationDays: e.target.value }))} />
            </>
          )}

          <Input type="date" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} />
          <Input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} />
          <Input type="number" placeholder="Limite de usos (opcional)" value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))} />

          <div className="md:col-span-2 space-y-2">
            <p className="text-sm font-medium">Restringir a planos (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((plan) => {
                const selected = form.allowedPlanTiers.includes(plan.value);
                return (
                  <Button
                    key={plan.value}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    onClick={() => setForm((prev) => ({
                      ...prev,
                      allowedPlanTiers: selected
                        ? prev.allowedPlanTiers.filter((value) => value !== plan.value)
                        : [...prev.allowedPlanTiers, plan.value],
                    }))}
                  >
                    {plan.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <Button onClick={submitForm} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Salvar</Button>
            {editingId ? <Button variant="outline" onClick={resetForm}>Cancelar edição</Button> : null}
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
                        <p className="text-xs text-muted-foreground">Usos: {coupon.usedCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={coupon.computedStatus === "ativo" ? "success" : "outline"}>{coupon.computedStatus}</Badge>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(coupon)}>Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => toggleCoupon(coupon.id, coupon.isActive)}>
                          {coupon.isActive ? <><XCircle className="w-4 h-4 mr-1" />Desativar</> : <><CheckCircle className="w-4 h-4 mr-1" />Ativar</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === coupon.id}
                          onClick={() => deleteCoupon(coupon)}
                        >
                          {deletingId === coupon.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {!coupons.length ? <p className="text-sm text-muted-foreground">Nenhum cupom encontrado.</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
