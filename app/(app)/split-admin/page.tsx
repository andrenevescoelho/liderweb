"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Scissors, Users, Mail, Calendar, Building2,
  Loader2, Download, Search, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SplitInterest {
  id: string;
  email: string;
  name: string | null;
  groupId: string | null;
  userId: string | null;
  createdAt: string;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function SplitAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [interests, setInterests] = useState<SplitInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || user.role !== "SUPERADMIN") {
      router.replace("/dashboard");
      return;
    }
    fetchInterests();
  }, [status, user]);

  const fetchInterests = async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/splits/interest");
      const data = await res.json();
      setInterests(data.interests ?? []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleExportCSV = () => {
    const header = "Nome,Email,Grupo ID,Usuário ID,Data\n";
    const rows = filtered.map(i =>
      `"${i.name ?? ""}","${i.email}","${i.groupId ?? ""}","${i.userId ?? ""}","${formatDate(i.createdAt)}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `split-interessados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = interests.filter(i =>
    !search ||
    i.email.toLowerCase().includes(search.toLowerCase()) ||
    (i.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Scissors className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Split — Interessados</h1>
            <p className="text-sm text-muted-foreground">
              Usuários que querem ser avisados quando o Split for lançado
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInterests} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{interests.length}</p>
              <p className="text-xs text-muted-foreground">Total de interessados</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {new Set(interests.filter(i => i.groupId).map(i => i.groupId)).size}
              </p>
              <p className="text-xs text-muted-foreground">Grupos representados</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {interests.filter(i => {
                  const d = new Date(i.createdAt);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).length}
              </p>
              <p className="text-xs text-muted-foreground">Este mês</p>
            </div>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border">
          <Scissors className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground">
            {search ? "Nenhum resultado para a busca." : "Nenhum interessado ainda."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[200px]">{item.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        item.userId
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted text-muted-foreground border border-border"
                      )}>
                        {item.userId ? "Usuário cadastrado" : "Email externo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} de {interests.length} registros
          </div>
        </div>
      )}
    </div>
  );
}
