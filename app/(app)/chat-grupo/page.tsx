"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  MessageCircle, SendHorizontal, Trash2, Users, X,
  Clock, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SessionUser } from "@/lib/types";
import { MAX_MESSAGE_LENGTH } from "@/lib/messages";

interface ChatItem {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string };
}

interface Member {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  profile?: { active: boolean };
  approvedRoles?: string[];
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function isRecentlyActive(lastLoginAt: string | null) {
  if (!lastLoginAt) return false;
  return Date.now() - new Date(lastLoginAt).getTime() < 15 * 60 * 1000;
}

function getActivityLabel(lastLoginAt: string | null) {
  if (!lastLoginAt) return "Nunca acessou";
  const diff = Date.now() - new Date(lastLoginAt).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Agora mesmo";
  if (mins < 60) return `Há ${mins} min`;
  if (hours < 24) return `Há ${hours}h`;
  if (days < 7) return `Há ${days} dias`;
  return "Há mais de uma semana";
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatGrupoPage() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const groupId = user?.groupId;

  // Grupo
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [unreadByUser, setUnreadByUser] = useState<Record<string, number>>({});

  // DM
  const [dmTarget, setDmTarget] = useState<Member | null>(null);
  const [dmItems, setDmItems] = useState<ChatItem[]>([]);
  const [dmContent, setDmContent] = useState("");
  const [dmLoading, setDmLoading] = useState(false);
  const [dmSending, setDmSending] = useState(false);
  const [dmNextCursor, setDmNextCursor] = useState<string | null>(null);
  const [dmError, setDmError] = useState("");

  const groupBottomRef = useRef<HTMLDivElement>(null);
  const dmBottomRef = useRef<HTMLDivElement>(null);
  const canAccess = useMemo(() => Boolean(groupId), [groupId]);

  // ── Grupo ──
  const loadMessages = async (cursor?: string | null) => {
    if (!groupId) return;
    const params = new URLSearchParams({ take: "30" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/groups/${groupId}/messages?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar chat");
    setItems((prev) => (cursor ? [...data.items, ...prev] : data.items ?? []));
    setNextCursor(data.nextCursor ?? null);
  };

  useEffect(() => {
    const init = async () => {
      if (!groupId) { setLoading(false); return; }
      try { setLoading(true); await loadMessages(); }
      catch (err: any) { setError(err.message || "Erro"); }
      finally { setLoading(false); }
    };
    init();
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const src = new EventSource(`/api/groups/${groupId}/messages/stream`);
    src.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as ChatItem;
        setItems((prev) => prev.some((i) => i.id === msg.id) ? prev : [...prev, msg]);
      } catch { /* noop */ }
    });
    src.onerror = () => src.close();
    return () => src.close();
  }, [groupId]);

  useEffect(() => {
    if (!loading) groupBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, loading]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setItems((prev) => prev.some((i) => i.id === data.id) ? prev : [...prev, data]);
      setContent("");
    } catch (err: any) { setError(err.message || "Erro"); }
    finally { setSending(false); }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!groupId || deletingMessageId) return;
    setDeletingMessageId(messageId);
    try {
      await fetch(`/api/groups/${groupId}/messages/${messageId}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== messageId));
    } catch { /* noop */ }
    finally { setDeletingMessageId(null); }
  };

  // ── Membros / unread ──
  const loadMembers = async () => {
    if (membersLoading) return;
    setMembersLoading(true);
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch { /* noop */ }
    finally { setMembersLoading(false); }
  };

  const loadUnread = async () => {
    try {
      const res = await fetch("/api/dm/unread");
      if (res.ok) setUnreadByUser((await res.json()).byUser ?? {});
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (sidebarOpen && members.length === 0) loadMembers();
    if (sidebarOpen) loadUnread();
  }, [sidebarOpen]);

  useEffect(() => {
    if (!groupId) return;
    loadUnread();
    const iv = setInterval(loadUnread, 30_000);
    return () => clearInterval(iv);
  }, [groupId]);

  // ── DM ──
  const openDm = async (member: Member) => {
    setDmTarget(member);
    setDmItems([]);
    setDmContent("");
    setDmError("");
    setDmLoading(true);
    try {
      const res = await fetch(`/api/dm/${member.id}?take=30`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setDmItems(data.items ?? []);
      setDmNextCursor(data.nextCursor ?? null);
      setUnreadByUser((prev) => { const n = { ...prev }; delete n[member.id]; return n; });
    } catch (err: any) { setDmError(err.message || "Erro"); }
    finally { setDmLoading(false); }
  };

  useEffect(() => {
    if (!dmTarget) return;
    const src = new EventSource(`/api/dm/${dmTarget.id}/stream`);
    src.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as ChatItem;
        setDmItems((prev) => prev.some((i) => i.id === msg.id) ? prev : [...prev, msg]);
      } catch { /* noop */ }
    });
    src.onerror = () => src.close();
    return () => src.close();
  }, [dmTarget?.id]);

  useEffect(() => {
    dmBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmItems]);

  const handleDmSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dmTarget || !dmContent.trim() || dmSending) return;
    setDmSending(true);
    setDmError("");
    try {
      const res = await fetch(`/api/dm/${dmTarget.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: dmContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setDmItems((prev) => prev.some((i) => i.id === data.id) ? prev : [...prev, data]);
      setDmContent("");
    } catch (err: any) { setDmError(err.message || "Erro"); }
    finally { setDmSending(false); }
  };

  if (!canAccess) {
    return <p className="text-sm text-slate-500">Você precisa estar associado a um grupo para acessar o chat.</p>;
  }

  const totalUnread = Object.values(unreadByUser).reduce((a, b) => a + b, 0);
  const activeMembers = members.filter((m) => isRecentlyActive(m.lastLoginAt));
  const otherMembers = members.filter((m) => !isRecentlyActive(m.lastLoginAt) && m.profile?.active !== false);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-3 overflow-hidden">

      {/* ── Área principal ── */}
      <div className="flex-1 rounded-xl border bg-white dark:bg-slate-900 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="p-4 border-b flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {dmTarget ? (
              <>
                <button type="button" onClick={() => setDmTarget(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-bold text-cyan-600 dark:text-cyan-400">
                    {getInitials(dmTarget.name)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${isRecentlyActive(dmTarget.lastLoginAt) ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{dmTarget.name}</p>
                  <p className="text-xs text-muted-foreground">{getActivityLabel(dmTarget.lastLoginAt)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-cyan-500" />
                </div>
                <div>
                  <h1 className="font-bold text-base tracking-tight">Chat do Grupo</h1>
                  <p className="text-xs text-muted-foreground">Converse com os membros do ministério</p>
                </div>
              </>
            )}
          </div>

          {!dmTarget && (
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm border transition-colors flex-shrink-0 ${sidebarOpen ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Membros</span>
              {totalUnread > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
              {totalUnread === 0 && activeMembers.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
                  {activeMembers.length}
                </span>
              )}
            </button>
          )}
        </header>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(dmTarget ? dmLoading : loading) && <p className="text-sm text-slate-500 text-center">Carregando...</p>}
          {(dmTarget ? dmError : error) && <p className="text-sm text-red-500">{dmTarget ? dmError : error}</p>}

          {dmTarget ? (
            <>
              {dmNextCursor && (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={async () => {
                    const res = await fetch(`/api/dm/${dmTarget.id}?take=30&cursor=${dmNextCursor}`);
                    const data = await res.json();
                    if (res.ok) { setDmItems((prev) => [...data.items, ...prev]); setDmNextCursor(data.nextCursor ?? null); }
                  }}>Carregar mais</Button>
                </div>
              )}
              {!dmLoading && dmItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                  <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="font-medium">Início da conversa com {dmTarget.name}</p>
                    <p className="text-sm text-muted-foreground">Envie uma mensagem para começar</p>
                  </div>
                </div>
              )}
              {dmItems.map((msg) => {
                const own = msg.sender.id === user?.id;
                return (
                  <article key={msg.id} className={`max-w-[80%] rounded-xl px-3 py-2 border ${own ? "ml-auto bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800" : "mr-auto bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{own ? "Você" : msg.sender.name}</span>
                      <time className="text-[10px] text-slate-500">{formatTime(msg.createdAt)}</time>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 break-words">{msg.content}</p>
                  </article>
                );
              })}
              <div ref={dmBottomRef} />
            </>
          ) : (
            <>
              {nextCursor && (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => loadMessages(nextCursor)}>Carregar histórico</Button>
                </div>
              )}
              {!loading && items.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">Ainda não há mensagens. Seja o primeiro!</p>
              )}
              {items.map((msg) => {
                const own = msg.sender.id === user?.id;
                return (
                  <article key={msg.id} className={`max-w-[80%] rounded-xl px-3 py-2 border ${own ? "ml-auto bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800" : "mr-auto bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{own ? "Você" : msg.sender.name}</span>
                      <div className="flex items-center gap-2">
                        <time className="text-[10px] text-slate-500">{formatTime(msg.createdAt)}</time>
                        {own && (
                          <button type="button" onClick={() => handleDeleteMessage(msg.id)} disabled={deletingMessageId === msg.id} className="text-slate-400 hover:text-red-500 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 break-words">{msg.content}</p>
                  </article>
                );
              })}
              <div ref={groupBottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form onSubmit={dmTarget ? handleDmSubmit : handleSubmit} className="p-3 border-t flex items-center gap-2">
          <Input
            value={dmTarget ? dmContent : content}
            onChange={(e) => dmTarget ? setDmContent(e.target.value) : setContent(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={dmTarget ? `Mensagem para ${dmTarget.name}...` : "Digite uma mensagem..."}
          />
          <Button type="submit" disabled={(dmTarget ? dmSending || !dmContent.trim() : sending || !content.trim())}>
            <SendHorizontal className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* ── Sidebar ── */}
      {sidebarOpen && !dmTarget && (
        <div className="w-72 flex-shrink-0 rounded-xl border bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Membros</span>
              <span className="text-xs text-muted-foreground">({members.length})</span>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {membersLoading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Carregando...</p>
            ) : (
              <>
                {activeMembers.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">Ativo agora — {activeMembers.length}</p>
                    {activeMembers.map((m) => (
                      <MemberItem key={m.id} member={m} isActive={true} isMe={m.id === user?.id} unread={unreadByUser[m.id] ?? 0} onOpenDm={() => { openDm(m); setSidebarOpen(false); }} />
                    ))}
                  </div>
                )}
                {otherMembers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">Membros — {otherMembers.length}</p>
                    {otherMembers.map((m) => (
                      <MemberItem key={m.id} member={m} isActive={false} isMe={m.id === user?.id} unread={unreadByUser[m.id] ?? 0} onOpenDm={() => { openDm(m); setSidebarOpen(false); }} />
                    ))}
                  </div>
                )}
                {members.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhum membro.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberItem({ member, isActive, isMe, unread, onOpenDm }: {
  member: Member; isActive: boolean; isMe: boolean; unread: number; onOpenDm: () => void;
}) {
  const roles = member.approvedRoles ?? [];
  return (
    <button
      type="button"
      onClick={isMe ? undefined : onOpenDm}
      disabled={isMe}
      className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors text-left ${isMe ? "cursor-default opacity-70" : "hover:bg-muted/50"}`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs font-bold text-cyan-600 dark:text-cyan-400">
          {member.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${isActive ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.name}{isMe && <span className="text-muted-foreground font-normal"> (você)</span>}</p>
        {roles.length > 0
          ? <p className="text-[10px] text-muted-foreground truncate">{roles.slice(0, 2).join(", ")}</p>
          : <div className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-muted-foreground" /><p className="text-[10px] text-muted-foreground">{getActivityLabel(member.lastLoginAt)}</p></div>
        }
      </div>
      {unread > 0 && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white flex-shrink-0">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
