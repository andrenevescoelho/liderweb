"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, ChevronDown, Minus } from "lucide-react";
import { SessionUser } from "@/lib/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/messages";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  name: string;
  lastLoginAt: string | null;
  approvedRoles?: string[];
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string };
}

interface ChatWindow {
  member: Member;
  minimized: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function isRecentlyActive(lastLoginAt: string | null) {
  if (!lastLoginAt) return false;
  return Date.now() - new Date(lastLoginAt).getTime() < 15 * 60 * 1000;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function FloatingChat() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const pathname = usePathname();
  const [listOpen, setListOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [unreadByUser, setUnreadByUser] = useState<Record<string, number>>({});
  const [windows, setWindows] = useState<ChatWindow[]>([]);

  const totalUnread = Object.values(unreadByUser).reduce((a, b) => a + b, 0);

  // Carregar membros ao abrir lista
  useEffect(() => {
    if (!listOpen || members.length > 0) return;
    setMembersLoading(true);
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [listOpen]);

  // Carregar unread periodicamente
  useEffect(() => {
    if (!user?.groupId) return;
    const load = () =>
      fetch("/api/dm/unread")
        .then((r) => r.json())
        .then((d) => setUnreadByUser(d.byUser ?? {}))
        .catch(() => {});
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [user?.groupId]);

  const openWindow = (member: Member) => {
    setListOpen(false);
    setWindows((prev) => {
      if (prev.find((w) => w.member.id === member.id)) {
        // Se já aberto, apenas restaurar se minimizado
        return prev.map((w) =>
          w.member.id === member.id ? { ...w, minimized: false } : w
        );
      }
      // Máximo 3 janelas abertas
      const next = prev.length >= 3 ? prev.slice(1) : prev;
      return [...next, { member, minimized: false }];
    });
    // Limpar unread
    setUnreadByUser((prev) => {
      const n = { ...prev };
      delete n[member.id];
      return n;
    });
  };

  const closeWindow = (memberId: string) => {
    setWindows((prev) => prev.filter((w) => w.member.id !== memberId));
  };

  const toggleMinimize = (memberId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.member.id === memberId ? { ...w, minimized: !w.minimized } : w
      )
    );
  };

  if (!user?.groupId) return null;

  // Ocultar no player de multitracks (ocupa tela cheia)
  const isPlayerOpen = /^\/multitracks\/[^/]+/.test(pathname ?? "");
  if (isPlayerOpen) return null;

  const activeMembers = members.filter(
    (m) => isRecentlyActive(m.lastLoginAt) && m.id !== user.id
  );
  const otherMembers = members.filter(
    (m) => !isRecentlyActive(m.lastLoginAt) && m.id !== user.id
  );

  return (
    <>
      {/* Janelas de chat abertas */}
      <div className="fixed bottom-0 right-16 flex items-end gap-2 z-40 pr-2">
        {windows.map((w, idx) => (
          <ChatWindowPanel
            key={w.member.id}
            window={w}
            userId={user.id}
            onClose={() => closeWindow(w.member.id)}
            onToggleMinimize={() => toggleMinimize(w.member.id)}
          />
        ))}
      </div>

      {/* Botão flutuante */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">

        {/* Lista de membros */}
        {listOpen && (
          <div className="w-72 rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
              <span className="font-semibold text-sm">Chat</span>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {membersLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
              ) : (
                <>
                  {activeMembers.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                        Ativo agora
                      </p>
                      {activeMembers.map((m) => (
                        <MemberRow
                          key={m.id}
                          member={m}
                          isActive
                          unread={unreadByUser[m.id] ?? 0}
                          onClick={() => openWindow(m)}
                        />
                      ))}
                    </div>
                  )}
                  {otherMembers.length > 0 && (
                    <div>
                      {activeMembers.length > 0 && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                          Membros
                        </p>
                      )}
                      {otherMembers.map((m) => (
                        <MemberRow
                          key={m.id}
                          member={m}
                          isActive={false}
                          unread={unreadByUser[m.id] ?? 0}
                          onClick={() => openWindow(m)}
                        />
                      ))}
                    </div>
                  )}
                  {members.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhum membro encontrado.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Botão principal */}
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        >
          {listOpen ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <MessageCircle className="w-5 h-5" />
          )}
          {totalUnread > 0 && !listOpen && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      </div>
    </>
  );
}

// ── Linha de membro na lista ──────────────────────────────────────────────────

function MemberRow({
  member, isActive, unread, onClick,
}: {
  member: Member;
  isActive: boolean;
  unread: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors text-left"
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {getInitials(member.name)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${isActive ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
      </div>
      <span className="flex-1 text-sm font-medium truncate">{member.name}</span>
      {unread > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white flex-shrink-0">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

// ── Janela de chat ────────────────────────────────────────────────────────────

function ChatWindowPanel({
  window: w, userId, onClose, onToggleMinimize,
}: {
  window: ChatWindow;
  userId: string;
  onClose: () => void;
  onToggleMinimize: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Carregar mensagens
  useEffect(() => {
    setLoading(true);
    fetch(`/api/dm/${w.member.id}?take=30`)
      .then((r) => r.json())
      .then((d) => setMessages(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [w.member.id]);

  // SSE
  useEffect(() => {
    const src = new EventSource(`/api/dm/${w.member.id}/stream`);
    src.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as ChatMessage;
        setMessages((prev) =>
          prev.some((i) => i.id === msg.id) ? prev : [...prev, msg]
        );
      } catch { /* noop */ }
    });
    src.onerror = () => src.close();
    return () => src.close();
  }, [w.member.id]);

  // Scroll automático
  useEffect(() => {
    if (!w.minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, w.minimized]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/dm/${w.member.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.some((i) => i.id === data.id) ? prev : [...prev, data]
        );
        setContent("");
      }
    } catch { /* noop */ }
    finally { setSending(false); }
  };

  const isActive = isRecentlyActive(w.member.lastLoginAt);

  return (
    <div className="w-64 flex flex-col rounded-t-xl border border-border shadow-2xl bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-primary/10 cursor-pointer select-none"
        onClick={onToggleMinimize}
      >
        <div className="relative flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
            {getInitials(w.member.name)}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background ${isActive ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
        </div>
        <span className="flex-1 text-xs font-semibold truncate">{w.member.name}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Corpo — oculto quando minimizado */}
      {!w.minimized && (
        <>
          <div className="flex-1 h-64 overflow-y-auto p-2 space-y-1.5">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Início da conversa com {w.member.name}
              </p>
            ) : (
              messages.map((msg) => {
                const own = msg.sender.id === userId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-xs break-words ${
                        own
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-center gap-1.5 p-2 border-t">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Aa"
              className="flex-1 rounded-full bg-muted px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={sending || !content.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors flex-shrink-0"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
