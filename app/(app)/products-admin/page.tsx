"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, X, CheckCircle2, Archive, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const PRODUCT_TYPES = [
  { value: "MULTITRACK_RENTAL", label: "Multitrack Avulso" },
  { value: "CUSTOM_MIX_EXTRA", label: "Custom Mix Avulso" },
  { value: "SPLIT_REQUEST", label: "Split Solicitação" },
  { value: "SPLIT_ACCESS", label: "Split Acervo" },
  { value: "MODULE_ACCESS", label: "Acesso a Módulo" },
  { value: "ADDON", label: "Add-on Genérico" },
];

const GATEWAY_OPTIONS = ["STRIPE", "ASAAS", "MERCADO_PAGO", "MANUAL"];

const EMPTY_FORM = {
  slug: "", name: "", description: "", type: "MULTITRACK_RENTAL",
  status: "ACTIVE", price: "", isRecurring: false, sortOrder: "0",
  imageUrl: "", metadata: "{}",
  gatewayMappings: [] as { gateway: string; externalId: string; isActive: boolean }[],
};

export default function ProductsAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = (session?.user as any);

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [metaError, setMetaError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && user?.role !== "SUPERADMIN") router.replace("/dashboard");
  }, [status, user, router]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/products");
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch { toast.error("Erro ao carregar produtos"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (status === "authenticated") fetchProducts(); }, [status, fetchProducts]);

  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setMetaError(""); setShowForm(true); };

  const openEdit = (p: any) => {
    setForm({
      slug: p.slug, name: p.name, description: p.description || "",
      type: p.type, status: p.status, price: String(p.price),
      isRecurring: p.isRecurring, sortOrder: String(p.sortOrder),
      imageUrl: p.imageUrl || "", metadata: JSON.stringify(p.metadata, null, 2),
      gatewayMappings: p.gatewayMappings.map((m: any) => ({ ...m })),
    });
    setEditingId(p.id);
    setMetaError("");
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setMetaError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetaError("");
    let parsedMeta: any;
    try { parsedMeta = JSON.parse(form.metadata); } catch { setMetaError("JSON inválido"); return; }

    setSaving(true);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        slug: form.slug, name: form.name, description: form.description || null,
        type: form.type, status: form.status, price: Number(form.price),
        isRecurring: form.isRecurring, sortOrder: Number(form.sortOrder),
        imageUrl: form.imageUrl || null, metadata: parsedMeta,
        gatewayMappings: form.gatewayMappings.filter(m => m.externalId),
      };
      const res = await fetch("/api/billing/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao salvar"); return; }
      toast.success(editingId ? "Produto atualizado!" : "Produto criado!");
      closeForm();
      fetchProducts();
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const archiveProduct = async (p: any) => {
    if (!confirm(`Arquivar "${p.name}"?`)) return;
    try {
      const res = await fetch(`/api/billing/products?id=${p.id}`, { method: "DELETE" });
      if (res.ok) { toast.success("Arquivado"); fetchProducts(); }
    } catch { toast.error("Erro"); }
  };

  const toggleStatus = async (p: any) => {
    const newStatus = p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await fetch("/api/billing/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, status: newStatus }),
      });
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: newStatus } : x));
      toast.success(newStatus === "ACTIVE" ? "Ativado" : "Desativado");
    } catch { toast.error("Erro"); }
  };

  const addGateway = () => setForm(f => ({ ...f, gatewayMappings: [...f.gatewayMappings, { gateway: "STRIPE", externalId: "", isActive: true }] }));
  const removeGateway = (idx: number) => setForm(f => ({ ...f, gatewayMappings: f.gatewayMappings.filter((_, i) => i !== idx) }));
  const updateGateway = (idx: number, field: string, value: any) =>
    setForm(f => ({ ...f, gatewayMappings: f.gatewayMappings.map((m, i) => i === idx ? { ...m, [field]: value } : m) }));

  if (status === "loading" || loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-7 w-7 text-primary" />Produtos Avulsos</h1>
          <p className="text-muted-foreground mt-1">Gerencie os produtos avulsos disponíveis para compra.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Novo Produto</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
              <Button variant="outline" className="mt-4" onClick={openNew}>Criar primeiro produto</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {products.map((p) => (
                <div key={p.id} className={cn("flex items-center gap-4 px-5 py-4", p.status === "ARCHIVED" && "opacity-40")}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{p.name}</p>
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">{p.type}</span>
                      {p.status === "ACTIVE" && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />Ativo</span>}
                      {p.status === "INACTIVE" && <span className="text-[10px] text-amber-400">Inativo</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      <span className="text-[11px] font-semibold text-primary">R$ {p.price.toFixed(2).replace(".", ",")}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">slug: {p.slug}</span>
                      {p.isRecurring && <span className="text-[11px] text-muted-foreground">Recorrente</span>}
                    </div>
                    {p.gatewayMappings.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5">
                        {p.gatewayMappings.map((m: any, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono">
                            {m.gateway}: {m.externalId.slice(0, 18)}…
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    {p.status !== "ARCHIVED" && (
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(p)}
                        className={p.status === "ACTIVE" ? "text-amber-400" : "text-emerald-400"}>
                        {p.status === "ACTIVE" ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => archiveProduct(p)} className="text-red-400 hover:bg-red-500/10">
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeForm}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-card z-10">
              <h2 className="text-lg font-bold">{editingId ? "Editar Produto" : "Novo Produto"}</h2>
              <button onClick={closeForm} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Slug *</label>
                  <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="multitrack-avulso" required disabled={!!editingId} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Nome *</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Multitrack Avulso" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tipo *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none">
                    {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Preço (R$) *</label>
                  <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="9.90" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none">
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Ordem</label>
                  <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Descrição</label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição do produto" />
                </div>
                <div className="flex items-center gap-3 col-span-2">
                  <input type="checkbox" id="isRecurring" checked={form.isRecurring} onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))} className="h-4 w-4 rounded" />
                  <label htmlFor="isRecurring" className="text-sm font-medium cursor-pointer">Produto recorrente</label>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Metadata <span className="text-[10px] text-muted-foreground">(JSON)</span></label>
                  <textarea value={form.metadata} onChange={e => { setForm(f => ({ ...f, metadata: e.target.value })); setMetaError(""); }}
                    rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none" />
                  {metaError && <p className="text-xs text-red-400">{metaError}</p>}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Gateways</label>
                  <Button type="button" size="sm" variant="outline" onClick={addGateway}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
                </div>
                {form.gatewayMappings.map((m, idx) => (
                  <div key={idx} className="flex gap-2 items-center rounded-lg border border-border bg-muted/30 p-3">
                    <select value={m.gateway} onChange={e => updateGateway(idx, "gateway", e.target.value)}
                      className="h-8 rounded border border-border bg-background px-2 text-sm focus:outline-none">
                      {GATEWAY_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <Input value={m.externalId} onChange={e => updateGateway(idx, "externalId", e.target.value)}
                      placeholder="price_xxx" className="flex-1 h-8 text-sm font-mono" />
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeGateway(idx)} className="text-red-400 h-8 w-8 p-0"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2 border-t">
                <Button type="button" variant="outline" onClick={closeForm} className="flex-1" disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : editingId ? "Salvar" : "Criar produto"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
