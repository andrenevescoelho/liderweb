"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SessionUser } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface AuditLogItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  description: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: any;
  oldValues: any;
  newValues: any;
  user: { id: string; name: string; email: string } | null;
  group: { id: string; name: string } | null;
}

const actionColor = (action: string) => {
  if (action.includes("FAILED") || action.includes("DELETED") || action.includes("DECLINED")) return "destructive" as const;
  if (action.includes("UPDATED") || action.includes("CHANGED")) return "secondary" as const;
  if (action.includes("CREATED") || action.includes("SUCCESS") || action.includes("CONFIRMED")) return "default" as const;
  return "outline" as const;
};

export default function AuditoriaPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [filters, setFilters] = useState({
    text: "",
    action: "",
    entityType: "",
    userId: "",
    groupId: "",
    from: "",
    to: "",
  });

  useEffect(() => {
    if (status === "loading") return;
    if (!user || !["SUPERADMIN", "ADMIN"].includes(user.role)) {
      router.push("/dashboard");
      return;
    }
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user?.role]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");

    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    return params.toString();
  }, [filters, page]);

  useEffect(() => {
    if (!user || !["SUPERADMIN", "ADMIN"].includes(user.role)) return;
    fetchData(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  const fetchData = async (targetPage: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams(queryString);
      params.set("page", String(targetPage));
      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao buscar logs");
      const data = await res.json();
      setItems(data.items ?? []);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? 1);
    } catch (error) {
      console.error("Erro ao carregar auditoria", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Rastreie ações administrativas e operacionais.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 md:grid-cols-6">
        <Input placeholder="Busca livre" value={filters.text} onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))} />
        <Input placeholder="Ação (ex.: USER_CREATED)" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} />
        <Input placeholder="Entidade (USER, GROUP...)" value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))} />
        <Input placeholder="Usuário (userId)" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} />
        {user?.role === "SUPERADMIN" ? (
          <Input placeholder="Grupo (groupId)" value={filters.groupId} onChange={(e) => setFilters((f) => ({ ...f, groupId: e.target.value }))} />
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          <Input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          <Input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Data/Hora</th>
              <th className="p-3">Usuário</th>
              <th className="p-3">Grupo</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Entidade</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">IP</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4" colSpan={8}>Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="p-4" colSpan={8}>Nenhum log encontrado.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="p-3">{format(new Date(item.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</td>
                  <td className="p-3">{item.user?.name ?? "Sistema"}</td>
                  <td className="p-3">{item.group?.name ?? "-"}</td>
                  <td className="p-3"><Badge variant={actionColor(item.action)}>{item.action}</Badge></td>
                  <td className="p-3">{item.entityType}{item.entityName ? ` • ${item.entityName}` : ""}</td>
                  <td className="p-3 max-w-[420px] truncate" title={item.description}>{item.description}</td>
                  <td className="p-3">{item.ipAddress ?? "-"}</td>
                  <td className="p-3"><Button variant="outline" size="sm" onClick={() => setSelected(item)}>Detalhes</Button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={page <= 1} onClick={() => fetchData(page - 1)}>Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {page} de {Math.max(totalPages, 1)}</span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => fetchData(page + 1)}>Próxima</Button>
      </div>

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Detalhes do log">
        {selected ? (
          <div className="space-y-2 text-sm">
            <p><strong>Data/Hora:</strong> {format(new Date(selected.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
            <p><strong>Usuário:</strong> {selected.user?.name ?? "Sistema"}</p>
            <p><strong>Grupo:</strong> {selected.group?.name ?? "-"}</p>
            <p><strong>Ação:</strong> {selected.action}</p>
            <p><strong>Entidade:</strong> {selected.entityType} {selected.entityName ? `• ${selected.entityName}` : ""}</p>
            <p><strong>Descrição:</strong> {selected.description}</p>
            <p><strong>Origem:</strong> {selected.ipAddress ?? "-"} • {selected.userAgent ?? "-"}</p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-2 text-xs">{JSON.stringify({ metadata: selected.metadata, oldValues: selected.oldValues, newValues: selected.newValues }, null, 2)}</pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
