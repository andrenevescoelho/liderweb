"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Bot, BookOpen, Headphones, Send, Loader2, ThumbsUp, ThumbsDown,
  Sparkles, Search, ChevronRight, Plus, Tag, ExternalLink, Lock,
  CheckCircle2, Clock, AlertCircle, XCircle, ArrowUpRight, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

type Tab = "chat" | "faq" | "tickets";

interface ChatMsg { role: "user" | "assistant"; content: string; source?: string; suggestions?: { label: string; href: string }[]; related?: { id: string; question: string }[]; canOpenTicket?: boolean; }
interface FaqItem { id: string; question: string; answer: string; tags: string[]; category: { name: string; slug: string }; }
interface FaqCategory { id: string; name: string; slug: string; }
interface Ticket { id: string; subject: string; message: string; status: string; priority: string; createdAt: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  OPEN:        { label: "Aberto",      color: "text-blue-400 bg-blue-400/10 border-blue-400/20",   icon: Clock },
  IN_PROGRESS: { label: "Em andamento",color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: AlertCircle },
  RESOLVED:    { label: "Resolvido",   color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: CheckCircle2 },
  CLOSED:      { label: "Fechado",     color: "text-muted-foreground bg-muted/20 border-border",   icon: XCircle },
};

const QUICK_QUESTIONS = [
  "Como criar uma escala?",
  "Como alugar uma multitrack?",
  "O que é o Custom Mix?",
  "Como ativar o Professor IA?",
  "Quais são os planos disponíveis?",
  "Como convidar membros?",
];

// ── Chat IA ───────────────────────────────────────────────────────────────────
function ChatTab() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Olá! 👋 Sou o assistente de suporte do Liderweb. Posso responder dúvidas sobre escalas, multitracks, custom mix, planos e muito mais. Como posso ajudar?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        source: data.source,
        suggestions: data.suggestions,
        related: data.relatedItems,
        canOpenTicket: data.canOpenTicket,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Ocorreu um erro. Tente novamente ou abra um ticket de suporte." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 px-1 py-4">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3", msg.role === "user" && "justify-end")}>
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={cn("max-w-[80%] space-y-2", msg.role === "user" && "items-end flex flex-col")}>
              <div className={cn(
                "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted/50 border border-border/50 rounded-tl-sm"
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {/* Source badge */}
              {msg.source && (
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border",
                  msg.source === "faq" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                  msg.source === "llm" ? "text-blue-400 bg-blue-400/10 border-blue-400/20" :
                  "text-muted-foreground bg-muted border-border"
                )}>
                  {msg.source === "faq" ? "📚 Baseado no FAQ" : msg.source === "llm" ? "🤖 Gerado por IA" : "❓ Sem resposta"}
                </span>
              )}
              {/* Sugestões de ação */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.suggestions.map((s, j) => (
                    <button key={j} onClick={() => router.push(s.href)}
                      className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors">
                      {s.label} <ChevronRight className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              {/* Perguntas relacionadas */}
              {msg.related && msg.related.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Perguntas relacionadas</p>
                  {msg.related.map(r => (
                    <button key={r.id} onClick={() => sendMessage(r.question)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left">
                      <ChevronRight className="h-3 w-3 flex-shrink-0" />{r.question}
                    </button>
                  ))}
                </div>
              )}
              {/* CTA ticket */}
              {msg.canOpenTicket && (
                <button onClick={() => { const el = document.getElementById("tab-tickets"); el?.click(); }}
                  className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-400 transition-colors">
                  <Headphones className="h-3.5 w-3.5" />Ainda precisa de ajuda? Abrir chamado
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted/50 border border-border/50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Perguntas rápidas */}
      {messages.length <= 1 && (
        <div className="border-t border-border/50 pt-3 pb-2">
          <p className="text-xs text-muted-foreground mb-2">Perguntas frequentes:</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q)}
                className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs hover:border-primary/40 hover:bg-primary/5 transition-colors">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border pt-3 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Digite sua dúvida..."
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={() => sendMessage()} disabled={!input.trim() || loading} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQTab() {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const fetchFaq = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeCategory !== "all") params.set("category", activeCategory);
        if (search) params.set("search", search);
        const res = await fetch(`/api/faq?${params}`);
        const data = await res.json();
        setCategories(data.categories ?? []);
        setItems(data.items ?? []);
      } finally { setLoading(false); }
    };
    fetchFaq();
  }, [activeCategory, search]);

  const grouped = items.reduce<Record<string, FaqItem[]>>((acc, item) => {
    const k = item.category.name;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          placeholder="Buscar no FAQ..." className="pl-9" />
      </div>

      {/* Categorias */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveCategory("all")}
          className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            activeCategory === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
          Todas
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCategory(cat.slug)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeCategory === cat.slug ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30")}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum resultado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([catName, catItems]) => (
            <div key={catName} className="rounded-xl border bg-card">
              <div className="px-4 py-2.5 border-b border-border/50">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{catName}</p>
              </div>
              <div className="px-4">
                <Accordion type="single" collapsible>
                  {catItems.map(item => (
                    <AccordionItem key={item.id} value={item.id}>
                      <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-3">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed pb-2">{item.answer}</p>
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.tags.map(tag => (
                              <span key={tag} className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                <Tag className="h-2.5 w-2.5" />#{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tickets ───────────────────────────────────────────────────────────────────
function TicketsTab() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/support/tickets");
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setIsPremium(data.isPremium ?? false);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchTickets(); }, []);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) { toast.error("Preencha assunto e mensagem"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, priority }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message || data.error); return; }
      toast.success("Chamado aberto! Nossa equipe responderá em breve.");
      setShowForm(false); setSubject(""); setMessage(""); setPriority("NORMAL");
      fetchTickets();
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (!isPremium) return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-4">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Lock className="h-7 w-7 text-primary" /></div>
      </div>
      <div>
        <h3 className="font-semibold text-lg mb-1">Suporte Premium</h3>
        <p className="text-sm text-muted-foreground">Abertura de chamados está disponível nos planos <strong>Avançado</strong> e <strong>Igreja</strong>.</p>
      </div>
      <Button onClick={() => window.open("/planos", "_blank")}>
        <ArrowUpRight className="h-4 w-4 mr-1.5" />Ver planos
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{tickets.length} chamado{tickets.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Novo chamado
        </Button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Novo chamado de suporte</h3>
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Assunto" />
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
            placeholder="Descreva detalhadamente sua dúvida ou problema..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex items-center gap-3">
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <option value="LOW">Baixa prioridade</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta prioridade</option>
              <option value="URGENT">Urgente</option>
            </select>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}Enviar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de tickets */}
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Headphones className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum chamado aberto.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.OPEN;
            const Icon = cfg.icon;
            return (
              <div key={ticket.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ticket.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold flex-shrink-0", cfg.color)}>
                    <Icon className="h-3 w-3" />{cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────────
export default function SupportPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams?.get("tab") as Tab) ?? "chat");

  const TABS = [
    { key: "chat" as Tab,    label: "Chat IA",         icon: Bot,       desc: "Respostas instantâneas" },
    { key: "faq" as Tab,     label: "FAQ",             icon: BookOpen,  desc: "Base de conhecimento" },
    { key: "tickets" as Tab, label: "Suporte Premium", icon: Headphones,desc: "Chamados para a equipe" },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Headphones className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Central de Suporte</h1>
          <p className="text-sm text-muted-foreground">Chat IA, FAQ e suporte humano em um só lugar</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} id={`tab-${tab.key}`} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all text-center",
                activeTab === tab.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground"
              )}>
              <Icon className="h-5 w-5" />
              <span className="text-xs font-semibold">{tab.label}</span>
              <span className="text-[10px] opacity-70 hidden sm:block">{tab.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div>
        {activeTab === "chat"    && <ChatTab />}
        {activeTab === "faq"     && <FAQTab />}
        {activeTab === "tickets" && <TicketsTab />}
      </div>
    </div>
  );
}
