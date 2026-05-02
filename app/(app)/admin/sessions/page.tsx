"use client";

import { useEffect, useState, useCallback } from "react";
import { Monitor, Smartphone, Trash2, ShieldOff, RefreshCw, ChevronDown, ChevronUp, Settings, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActiveSession {
  id: string;
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface UserWithSessions {
  id: string;
  name: string;
  email: string;
  role: string;
  maxSessions: number;
  sessionTimeoutHours: number | null;
  activeSessions: ActiveSession[];
}

function deviceIcon(userAgent: string | null) {
  if (!userAgent) return <Monitor className="h-4 w-4 text-muted-foreground" />;
  if (/mobile|android|iphone/i.test(userAgent)) return <Smartphone className="h-4 w-4 text-muted-foreground" />;
  return <Monitor className="h-4 w-4 text-muted-foreground" />;
}

function deviceName(userAgent: string | null) {
  if (!userAgent) return "Dispositivo desconhecido";
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Navegador";
}

const TIMEOUT_OPTIONS = [
  { label: "Sem timeout", value: 0 },
  { label: "1 hora", value: 1 },
  { label: "4 horas", value: 4 },
  { label: "8 horas", value: 8 },
  { label: "24 horas", value: 24 },
  { label: "3 dias", value: 72 },
  { label: "7 dias", value: 168 },
  { label: "30 dias", value: 720 },
];

export default function SessionsAdminPage() {
  const [users, setUsers] = useState<UserWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingMax, setEditingMax] = useState<{ userId: string; value: number } | null>(null);
  const [editingTimeout, setEditingTimeout] = useState<{ userId: string; value: number } | null>(null);
  const [globalTimeout, setGlobalTimeout] = useState<number>(0);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sessions");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGlobalTimeout = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sessions?config=global");
      if (res.ok) {
        const data = await res.json();
        setGlobalTimeout(data.globalTimeoutHours ?? 0);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchUsers(); fetchGlobalTimeout(); }, [fetchUsers, fetchGlobalTimeout]);

  async function revokeSession(sessionId: string, userName: string) {
    if (!confirm(`Revogar esta sessão de ${userName}?`)) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) { toast.success("Sessão revogada"); fetchUsers(); }
    else toast.error("Erro ao revogar sessão");
  }

  async function revokeAll(userId: string, userName: string) {
    if (!confirm(`Revogar TODAS as sessões de ${userName}?`)) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, revokeAll: true }),
    });
    if (res.ok) { const d = await res.json(); toast.success(d.message); fetchUsers(); }
    else toast.error("Erro ao revogar sessões");
  }

  async function saveMaxSessions() {
    if (!editingMax) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingMax.userId, maxSessions: editingMax.value }),
      });
      if (res.ok) { toast.success("Limite atualizado"); setEditingMax(null); fetchUsers(); }
      else toast.error("Erro ao atualizar");
    } finally { setSaving(false); }
  }

  async function saveUserTimeout() {
    if (!editingTimeout) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingTimeout.userId, sessionTimeoutHours: editingTimeout.value || null }),
      });
      if (res.ok) { toast.success("Timeout atualizado"); setEditingTimeout(null); fetchUsers(); }
      else toast.error("Erro ao atualizar");
    } finally { setSaving(false); }
  }

  async function saveGlobalTimeout() {
    setSavingGlobal(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ globalTimeoutHours: globalTimeout || null }),
      });
      if (res.ok) { toast.success("Timeout global atualizado!"); }
      else toast.error("Erro ao salvar");
    } finally { setSavingGlobal(false); }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalActive = users.reduce((acc, u) => acc + u.activeSessions.length, 0);
  const usersWithMultiple = users.filter(u => u.activeSessions.length > 1).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Controle de Sessões</h1>
          <p className="text-sm text-muted-foreground mt-1">Sessões ativas, limites e timeout por inatividade</p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-4 w-4" />Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold">{users.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Usuários cadastrados</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-green-500">{totalActive}</div>
          <div className="text-xs text-muted-foreground mt-1">Sessões ativas agora</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold text-yellow-500">{usersWithMultiple}</div>
          <div className="text-xs text-muted-foreground mt-1">Com múltiplas sessões</div>
        </div>
      </div>

      {/* Configuração global de timeout */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          Timeout global por inatividade
          <span className="text-xs text-muted-foreground font-normal">— aplicado a todos os usuários sem timeout específico</span>
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={globalTimeout}
            onChange={e => setGlobalTimeout(Number(e.target.value))}
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {TIMEOUT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={saveGlobalTimeout}
            disabled={savingGlobal}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {savingGlobal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
            Salvar
          </button>
        </div>
        {globalTimeout > 0 && (
          <p className="text-xs text-muted-foreground">
            Sessões inativas por mais de <strong>{TIMEOUT_OPTIONS.find(o => o.value === globalTimeout)?.label}</strong> serão encerradas automaticamente.
          </p>
        )}
      </div>

      {/* Busca */}
      <input
        type="text"
        placeholder="Buscar por nome ou email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Lista de usuários */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <div key={user.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(expanded === user.id ? null : user.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.role === "SUPERADMIN" ? "bg-red-500/10 text-red-500" :
                      user.role === "ADMIN" ? "bg-blue-500/10 text-blue-500" :
                      user.role === "LEADER" ? "bg-purple-500/10 text-purple-500" :
                      "bg-muted text-muted-foreground"
                    }`}>{user.role}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                    <span>Sessões: {user.activeSessions.length}/{user.maxSessions}</span>
                    <span>Timeout: {user.sessionTimeoutHours ? `${user.sessionTimeoutHours}h` : `global (${globalTimeout ? TIMEOUT_OPTIONS.find(o => o.value === globalTimeout)?.label : "sem timeout"})`}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Editar limite de sessões */}
                  {editingMax?.userId === user.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input type="number" min={1} max={10} value={editingMax.value}
                        onChange={e => setEditingMax({ ...editingMax, value: Number(e.target.value) })}
                        className="w-14 h-7 rounded border border-input bg-background px-2 text-sm text-center" />
                      <button onClick={saveMaxSessions} disabled={saving}
                        className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">{saving ? "..." : "OK"}</button>
                      <button onClick={() => setEditingMax(null)} className="text-xs text-muted-foreground px-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setEditingMax({ userId: user.id, value: user.maxSessions }); }}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted flex items-center gap-1">
                      <Settings className="h-3 w-3" />Sessões
                    </button>
                  )}

                  {/* Editar timeout por usuário */}
                  {editingTimeout?.userId === user.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <select value={editingTimeout.value}
                        onChange={e => setEditingTimeout({ ...editingTimeout, value: Number(e.target.value) })}
                        className="h-7 rounded border border-input bg-background px-2 text-xs">
                        {TIMEOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={saveUserTimeout} disabled={saving}
                        className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">{saving ? "..." : "OK"}</button>
                      <button onClick={() => setEditingTimeout(null)} className="text-xs text-muted-foreground px-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setEditingTimeout({ userId: user.id, value: user.sessionTimeoutHours ?? 0 }); }}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted flex items-center gap-1">
                      <Clock className="h-3 w-3" />Timeout
                    </button>
                  )}

                  {user.activeSessions.length > 0 && (
                    <button onClick={e => { e.stopPropagation(); revokeAll(user.id, user.name); }}
                      className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-500/10 flex items-center gap-1">
                      <ShieldOff className="h-3 w-3" />Revogar todas
                    </button>
                  )}

                  {expanded === user.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {expanded === user.id && (
                <div className="border-t border-border divide-y divide-border">
                  {user.activeSessions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">Nenhuma sessão ativa</div>
                  ) : (
                    user.activeSessions.map(s => (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                        {deviceIcon(s.userAgent)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{deviceName(s.userAgent)}</div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {s.ip && <span className="text-xs text-muted-foreground">IP: {s.ip}</span>}
                            <span className="text-xs text-muted-foreground">
                              Criada {formatDistanceToNow(new Date(s.createdAt), { locale: ptBR, addSuffix: true })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Ativa {formatDistanceToNow(new Date(s.lastSeenAt), { locale: ptBR, addSuffix: true })}
                            </span>
                          </div>
                        </div>
                        <button onClick={() => revokeSession(s.sessionId, user.name)}
                          className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-500/10 flex items-center gap-1 flex-shrink-0">
                          <Trash2 className="h-3 w-3" />Revogar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
