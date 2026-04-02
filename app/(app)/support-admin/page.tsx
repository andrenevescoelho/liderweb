"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Headphones, Clock, AlertCircle, CheckCircle2, XCircle, ChevronRight,
  Loader2, Send, Filter, RefreshCw, User, Building2, Lock, MessageSquare,
  ArrowLeft, Eye, EyeOff, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { refreshBadges } from "@/hooks/use-badges";

interface Reply { id: string; message: string; isInternal: boolean; createdAt: string; author: { id: string; name: string; role: string }; }
interface Ticket {
  id: string; subject: string; message: string; status: string; priority: string; createdAt: string; updatedAt: string;
  user: { name: string; email: string };
  group: { name: string };
  replies?: Reply[];
}
interface Stats { open: number; inProgress: number; resolved: number; total: number; }

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; next: string | null }> = {
  OPEN:        { label: "Aberto",       color: "text-blue-400 bg-blue-400/10 border-blue-400/20",    icon: Clock,         next: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Em andamento", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: AlertCircle,   next: "RESOLVED" },
  RESOLVED:    { label: "Resolvido",    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: CheckCircle2, next: "CLOSED" },
  CLOSED:      { label: "Fechado",      color: "text-muted-foreground bg-muted/20 border-border",    icon: XCircle,       next: null },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Baixa",   color: "text-slate-400" },
  NORMAL: { label: "Normal",  color: "text-blue-400" },
  HIGH:   { label: "Alta",    color: "text-amber-400" },
  URGENT: { label: "Urgente", color: "text-red-400" },
};

function timeAgo(date: string) {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const dd = Math.floor(h / 24);
  if (m < 1) return "Agora";
  if (m < 60) return `${m}min`;
  if (h < 24) return `${h}h`;
  if (dd < 7) return `${dd}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Detalhe do ticket ─────────────────────────────────────────────────────────
function TicketDetail({ ticketId, onBack, onStatusChange }: {
  ticketId: string; onBack: () => void; onStatusChange: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession() || {};
  const me = (session?.user as SessionUser)?.id;

  const load = useCallback(async () => {
    const res = await fetch(`/api/support/tickets?id=${ticketId}`);
    const data = await res.json();
    setTicket(data.ticket);
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [ticket?.replies]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticketId, reply, isInternal }),
      });
      if (!res.ok) { toast.error("Erro ao enviar resposta"); return; }
      setReply("");
      await load();
      onStatusChange();
      refreshBadges();
      toast.success(isInternal ? "Nota interna salva" : "Resposta enviada!");
    } finally { setSending(false); }
  };

  const changeStatus = async (status: string) => {
    setChangingStatus(true);
    try {
      await fetch("/api/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticketId, status }),
      });
      await load();
      onStatusChange();
      refreshBadges();
      toast.success("Status atualizado");
    } finally { setChangingStatus(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!ticket) return <div className="text-center py-12 text-muted-foreground">Ticket não encontrado</div>;

  const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.OPEN;
  const StatusIcon = cfg.icon;
  const prio = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.NORMAL;

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Header */}
      <div className="flex items-start gap-3 pb-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{ticket.subject}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />{ticket.user.name}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />{ticket.group.name}
            </div>
            <span className={cn("text-xs font-medium", prio.color)}>{prio.label}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
          </div>
        </div>
        {/* Status + ações */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold", cfg.color)}>
            <StatusIcon className="h-3 w-3" />{cfg.label}
          </span>
          {cfg.next && (
            <Button size="sm" variant="outline" onClick={() => changeStatus(cfg.next!)} disabled={changingStatus}>
              {changingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {STATUS_CONFIG[cfg.next]?.label}
            </Button>
          )}
          {ticket.status !== "CLOSED" && (
            <Button size="sm" variant="outline" onClick={() => changeStatus("CLOSED")} disabled={changingStatus}
              className="text-muted-foreground hover:text-red-400">
              Fechar
            </Button>
          )}
        </div>
      </div>

      {/* Conversa */}
      <div className="flex-1 overflow-y-auto space-y-4 py-4 px-1">
        {/* Mensagem original */}
        <div className="flex gap-3">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
            {ticket.user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold">{ticket.user.name}</span>
              <span className="text-[10px] text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border/50 px-4 py-3 text-sm whitespace-pre-wrap">
              {ticket.message}
            </div>
          </div>
        </div>

        {/* Replies */}
        {ticket.replies?.map(r => {
          const isMe = r.author.id === me;
          const isAdmin = r.author.role === "SUPERADMIN";
          return (
            <div key={r.id} className={cn("flex gap-3", isAdmin && "justify-end")}>
              {!isAdmin && (
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {r.author.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className={cn("max-w-[80%]", isAdmin && "items-end flex flex-col")}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{isAdmin ? "Suporte Liderweb" : r.author.name}</span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(r.createdAt)}</span>
                  {r.isInternal && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                      <Lock className="h-2.5 w-2.5" />Interno
                    </span>
                  )}
                </div>
                <div className={cn(
                  "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                  isAdmin
                    ? r.isInternal
                      ? "bg-amber-500/10 border border-amber-500/20 rounded-tr-sm text-amber-100"
                      : "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted/40 border border-border/50 rounded-tl-sm"
                )}>
                  {r.message}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input de resposta */}
      {ticket.status !== "CLOSED" && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsInternal(false)}
              className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
                !isInternal ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/20")}>
              <MessageSquare className="h-3 w-3" />Resposta ao cliente
            </button>
            <button onClick={() => setIsInternal(true)}
              className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
                isInternal ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-border text-muted-foreground hover:border-amber-500/20")}>
              <Lock className="h-3 w-3" />Nota interna
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply(); }}
              placeholder={isInternal ? "Nota interna (não visível ao cliente)..." : "Escreva sua resposta... (Ctrl+Enter para enviar)"}
              rows={3}
              className={cn(
                "flex-1 rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1",
                isInternal ? "border-amber-500/30 focus:ring-amber-500/40 bg-amber-500/5" : "border-border focus:ring-primary/40"
              )}
            />
            <Button onClick={sendReply} disabled={!reply.trim() || sending} size="icon" className="self-end h-10 w-10">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function SupportAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ open: 0, inProgress: 0, resolved: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status === "authenticated" && user?.role !== "SUPERADMIN") { router.replace("/dashboard"); return; }
  }, [status, user]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/support/tickets?${params}`);
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setStats(data.stats ?? { open: 0, inProgress: 0, resolved: 0, total: 0 });
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { if (user?.role === "SUPERADMIN") loadTickets(); }, [loadTickets, user]);

  const filtered = tickets.filter(t =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.user.name.toLowerCase().includes(search.toLowerCase()) ||
    t.group.name.toLowerCase().includes(search.toLowerCase())
  );

  if (status === "loading" || !user) return (
    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Headphones className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Suporte — Atendimento</h1>
            <p className="text-sm text-muted-foreground">Gerencie os chamados da plataforma</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadTickets} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />Atualizar
        </Button>
      </div>

      {selectedId ? (
        <TicketDetail ticketId={selectedId} onBack={() => setSelectedId(null)} onStatusChange={loadTickets} />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Abertos",       value: stats.open,       color: "text-blue-400",    bg: "bg-blue-400/10" },
              { label: "Em andamento",  value: stats.inProgress, color: "text-amber-400",   bg: "bg-amber-400/10" },
              { label: "Resolvidos",    value: stats.resolved,   color: "text-emerald-400", bg: "bg-emerald-400/10" },
              { label: "Total",         value: stats.total,      color: "text-foreground",  bg: "bg-muted/30" },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl border border-border p-4", s.bg)}>
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por assunto, usuário ou grupo..." className="pl-8 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              {["all", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/20")}>
                  {s === "all" ? "Todos" : STATUS_CONFIG[s]?.label ?? s}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de tickets */}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Headphones className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum ticket encontrado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(ticket => {
                const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.OPEN;
                const StatusIcon = cfg.icon;
                const prio = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.NORMAL;
                const hasReplies = (ticket.replies?.length ?? 0) > 0;
                return (
                  <button key={ticket.id} onClick={() => setSelectedId(ticket.id)}
                    className="w-full text-left rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-all p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border", cfg.color)}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm truncate">{ticket.subject}</p>
                          {!hasReplies && ticket.status === "OPEN" && (
                            <span className="flex-shrink-0 text-[10px] rounded-full bg-blue-500/15 text-blue-400 border border-blue-400/20 px-1.5 py-0.5">Novo</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{ticket.message}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="h-3 w-3" />{ticket.user.name}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Building2 className="h-3 w-3" />{ticket.group.name}
                          </span>
                          {hasReplies && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <MessageSquare className="h-3 w-3" />{ticket.replies?.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>
                          {cfg.label}
                        </span>
                        <span className={cn("text-[10px] font-medium", prio.color)}>{prio.label}</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
