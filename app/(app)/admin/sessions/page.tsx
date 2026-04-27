"use client";

import { useEffect, useState, useCallback } from "react";
import { Monitor, Smartphone, Trash2, ShieldOff, RefreshCw, ChevronDown, ChevronUp, Settings } from "lucide-react";
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

export default function SessionsAdminPage() {
  const [users, setUsers] = useState<UserWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingMax, setEditingMax] = useState<{ userId: string; value: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sessions");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function revokeSession(sessionId: string, userName: string) {
    if (!confirm(`Revogar esta sessão de ${userName}?`)) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (res.ok) {
      toast.success("Sessão revogada");
      fetchUsers();
    } else {
      toast.error("Erro ao revogar sessão");
    }
  }

  async function revokeAll(userId: string, userName: string) {
    if (!confirm(`Revogar TODAS as sessões de ${userName}? Ele precisará fazer login novamente.`)) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, revokeAll: true }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(data.message);
      fetchUsers();
    } else {
      toast.error("Erro ao revogar sessões");
    }
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
      if (res.ok) {
        toast.success("Limite de sessões atualizado");
        setEditingMax(null);
        fetchUsers();
      } else {
        toast.error("Erro ao atualizar");
      }
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalActive = users.reduce((acc, u) => acc + u.activeSessions.length, 0);
  const usersWithMultiple = users.filter((u) => u.activeSessions.length > 1).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Controle de Sessões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie sessões ativas e limites por usuário
          </p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-4 w-4" />Atualizar
        </button>
      </div>

      {/* Resumo */}
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
          <div className="text-xs text-muted-foreground mt-1">Usuários com múltiplas sessões</div>
        </div>
      </div>

      {/* Busca */}
      <input
        type="text"
        placeholder="Buscar por nome ou email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((user) => (
            <div key={user.id} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Header do usuário */}
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
                </div>

                {/* Sessões ativas */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-center">
                    <div className={`text-sm font-bold ${
                      user.activeSessions.length > user.maxSessions ? "text-red-500" :
                      user.activeSessions.length > 0 ? "text-green-500" : "text-muted-foreground"
                    }`}>
                      {user.activeSessions.length}/{user.maxSessions}
                    </div>
                    <div className="text-xs text-muted-foreground">sessões</div>
                  </div>

                  {/* Editar limite */}
                  {editingMax?.userId === user.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="number" min={1} max={10}
                        value={editingMax.value}
                        onChange={(e) => setEditingMax({ ...editingMax, value: Number(e.target.value) })}
                        className="w-14 h-7 rounded border border-input bg-background px-2 text-sm text-center"
                      />
                      <button onClick={saveMaxSessions} disabled={saving}
                        className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded hover:bg-primary/90">
                        {saving ? "..." : "OK"}
                      </button>
                      <button onClick={() => setEditingMax(null)} className="text-xs text-muted-foreground hover:text-foreground px-1">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingMax({ userId: user.id, value: user.maxSessions }); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                    >
                      <Settings className="h-3 w-3" />Limite
                    </button>
                  )}

                  {user.activeSessions.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); revokeAll(user.id, user.name); }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <ShieldOff className="h-3 w-3" />Revogar todas
                    </button>
                  )}

                  {expanded === user.id
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  }
                </div>
              </div>

              {/* Sessões expandidas */}
              {expanded === user.id && (
                <div className="border-t border-border divide-y divide-border">
                  {user.activeSessions.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground">Nenhuma sessão ativa</div>
                  ) : (
                    user.activeSessions.map((s) => (
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
                        <button
                          onClick={() => revokeSession(s.sessionId, user.name)}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-500/10 transition-colors flex-shrink-0"
                        >
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
