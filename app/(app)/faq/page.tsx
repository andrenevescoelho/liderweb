"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CircleHelp, Search, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  FolderPlus, ToggleLeft, ToggleRight, Loader2, X, Check, Tag,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface FaqCategory { id: string; slug: string; name: string; order: number; isActive?: boolean; }
interface FaqItem { id: string; question: string; answer: string; tags: string[]; order: number; isPublished?: boolean; category: FaqCategory; }

const ALL = "all";

// ── Modal simples ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Formulário de categoria ───────────────────────────────────────────────────
function CategoryForm({ initial, categories, onSave, onClose }: {
  initial?: FaqCategory; categories: FaqCategory[]; onSave: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [order, setOrder] = useState(initial?.order ?? 0);
  const [saving, setSaving] = useState(false);

  const autoSlug = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { toast.error("Nome e slug obrigatórios"); return; }
    setSaving(true);
    try {
      const method = initial ? "PUT" : "POST";
      const body = initial
        ? { type: "category", id: initial.id, name, slug, order }
        : { type: "category", name, slug, order };
      const res = await fetch("/api/faq", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erro"); return; }
      toast.success(initial ? "Categoria atualizada!" : "Categoria criada!");
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome</label>
        <Input value={name} onChange={e => { setName(e.target.value); if (!initial) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Multitracks" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug</label>
        <Input value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="ex: multitracks" className="font-mono text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Ordem</label>
        <Input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} className="w-24" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {initial ? "Salvar" : "Criar"}
        </Button>
      </div>
    </div>
  );
}

// ── Formulário de item ────────────────────────────────────────────────────────
function ItemForm({ initial, categories, onSave, onClose }: {
  initial?: FaqItem; categories: FaqCategory[]; onSave: () => void; onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? categories[0]?.id ?? "");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [order, setOrder] = useState(initial?.order ?? 0);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!question.trim() || !answer.trim() || !categoryId) { toast.error("Categoria, pergunta e resposta obrigatórias"); return; }
    setSaving(true);
    try {
      const method = initial ? "PUT" : "POST";
      const body = initial
        ? { type: "item", id: initial.id, categoryId, question, answer, tags, order }
        : { type: "item", categoryId, question, answer, tags, order };
      const res = await fetch("/api/faq", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Erro"); return; }
      toast.success(initial ? "Item atualizado!" : "Item criado!");
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Pergunta</label>
        <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Como fazer...?" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Resposta</label>
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={5}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Explique detalhadamente..." />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags</label>
        <div className="flex gap-2 mb-2">
          <Input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="adicionar tag"
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            className="flex-1 text-sm" />
          <Button size="sm" variant="outline" onClick={addTag}><Tag className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map(t => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              #{t}
              <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="text-muted-foreground hover:text-red-400">×</button>
            </span>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Ordem</label>
        <Input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} className="w-24" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
          {initial ? "Salvar" : "Criar"}
        </Button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function FaqPage() {
  const { data: session } = useSession() || {};
  const user = session?.user as SessionUser | undefined;
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL);

  // Modais admin
  const [modal, setModal] = useState<null | "newCat" | "editCat" | "newItem" | "editItem">(null);
  const [editingCat, setEditingCat] = useState<FaqCategory | null>(null);
  const [editingItem, setEditingItem] = useState<FaqItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFaq = async () => {
    try {
      setLoading(true); setError("");
      const params = new URLSearchParams();
      if (activeCategory !== ALL) params.set("category", activeCategory);
      if (search) params.set("search", search);
      const res = await fetch(`/api/faq?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar FAQ");
      setCategories(data.categories ?? []);
      setItems(data.items ?? []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFaq(); }, [activeCategory, search]);

  const closeModal = () => { setModal(null); setEditingCat(null); setEditingItem(null); };
  const afterSave = () => { closeModal(); fetchFaq(); };

  const toggleCatActive = async (cat: FaqCategory) => {
    await fetch("/api/faq", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "category", id: cat.id, isActive: !cat.isActive }) });
    fetchFaq();
  };

  const toggleItemPublished = async (item: FaqItem) => {
    await fetch("/api/faq", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "item", id: item.id, isPublished: !item.isPublished }) });
    fetchFaq();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Remover esta pergunta?")) return;
    await fetch(`/api/faq?type=item&id=${id}`, { method: "DELETE" });
    toast.success("Removido"); fetchFaq();
  };

  const deleteCat = async (id: string) => {
    if (!confirm("Remover esta categoria e todos seus itens?")) return;
    await fetch(`/api/faq?type=category&id=${id}`, { method: "DELETE" });
    toast.success("Categoria removida"); fetchFaq();
  };

  const groupedItems = useMemo(() => {
    return items.reduce<Record<string, FaqItem[]>>((acc, item) => {
      const key = item.category.name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [items]);

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <CircleHelp className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FAQ Liderweb</h1>
            <p className="text-sm text-muted-foreground">Dúvidas frequentes sobre a plataforma</p>
          </div>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setModal("newCat")}>
              <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Nova categoria
            </Button>
            <Button size="sm" onClick={() => setModal("newItem")} disabled={categories.length === 0}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Nova pergunta
            </Button>
          </div>
        )}
      </div>

      {/* Busca + filtros */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por dúvida, palavra-chave ou recurso..."
            className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={activeCategory === ALL ? "default" : "outline"} onClick={() => setActiveCategory(ALL)}>
            Todas
          </Button>
          {categories.map(cat => (
            <Button key={cat.id} size="sm"
              variant={activeCategory === cat.slug ? "default" : "outline"}
              onClick={() => setActiveCategory(cat.slug)}
              className={cn(!cat.isActive && "opacity-50 line-through")}>
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Admin — gestão de categorias */}
      {isSuperAdmin && categories.length > 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Gerenciar categorias</p>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5">
                <span className={cn("text-xs font-medium", !cat.isActive && "line-through text-muted-foreground")}>{cat.name}</span>
                <button onClick={() => toggleCatActive(cat)} title={cat.isActive ? "Desativar" : "Ativar"}>
                  {cat.isActive ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </button>
                <button onClick={() => { setEditingCat(cat); setModal("editCat"); }} title="Editar">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
                <button onClick={() => deleteCat(cat.id)} title="Remover">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando FAQ...
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border p-8 text-center">
          <CircleHelp className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {isSuperAdmin ? "Nenhuma pergunta cadastrada ainda. Clique em \"Nova pergunta\" para começar." : "Nenhum resultado encontrado."}
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([categoryName, categoryItems]) => (
            <section key={categoryName} className="rounded-xl border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{categoryName}</h2>
              <Accordion type="single" collapsible className="w-full">
                {categoryItems.map(item => (
                  <AccordionItem key={item.id} value={item.id}
                    className={cn(!item.isPublished && isSuperAdmin && "opacity-50")}>
                    <div className="flex items-center gap-2">
                      <AccordionTrigger className="text-left flex-1 hover:no-underline text-sm font-medium">
                        {item.question}
                        {isSuperAdmin && !item.isPublished && (
                          <span className="ml-2 text-[10px] rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5">rascunho</span>
                        )}
                      </AccordionTrigger>
                      {isSuperAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => toggleItemPublished(item)} title={item.isPublished ? "Despublicar" : "Publicar"}>
                            {item.isPublished
                              ? <ToggleRight className="h-4 w-4 text-primary" />
                              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <button onClick={() => { setEditingItem(item); setModal("editItem"); }}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button onClick={() => deleteItem(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    <AccordionContent>
                      <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                      {item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.tags.map(tag => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      )}

      {/* Modais */}
      {modal === "newCat" && (
        <Modal title="Nova categoria" onClose={closeModal}>
          <CategoryForm categories={categories} onSave={afterSave} onClose={closeModal} />
        </Modal>
      )}
      {modal === "editCat" && editingCat && (
        <Modal title="Editar categoria" onClose={closeModal}>
          <CategoryForm initial={editingCat} categories={categories} onSave={afterSave} onClose={closeModal} />
        </Modal>
      )}
      {modal === "newItem" && (
        <Modal title="Nova pergunta" onClose={closeModal}>
          <ItemForm categories={categories} onSave={afterSave} onClose={closeModal} />
        </Modal>
      )}
      {modal === "editItem" && editingItem && (
        <Modal title="Editar pergunta" onClose={closeModal}>
          <ItemForm initial={editingItem} categories={categories} onSave={afterSave} onClose={closeModal} />
        </Modal>
      )}
    </div>
  );
}
