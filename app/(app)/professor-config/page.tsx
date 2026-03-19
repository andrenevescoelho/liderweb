"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { GraduationCap, Search, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface MemberCoachInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  memberFunction: string | null;
  instruments: string[];
  voiceType: string | null;
  coachEnabled: boolean;
  coachLevel: number;
  coachProfileId: string | null;
}

export default function ProfessorConfigPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [members, setMembers] = useState<MemberCoachInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      const groupParam = user?.groupId ? `?groupId=${user.groupId}` : "";
      const res = await fetch(`/api/music-coach/config${groupParam}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data);
    } catch {
      toast.error("Erro ao carregar membros");
    } finally {
      setLoading(false);
    }
  }, [user?.groupId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!user || !["ADMIN", "SUPERADMIN"].includes(user.role)) {
      router.replace("/dashboard");
      return;
    }
    fetchMembers();
  }, [status, user, router, fetchMembers]);

  const toggleMember = async (memberId: string, enabled: boolean) => {
    setSaving((prev) => ({ ...prev, [memberId]: true }));
    try {
      const res = await fetch("/api/music-coach/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [memberId], enabled, groupId: user?.groupId }),
      });
      if (!res.ok) throw new Error();
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, coachEnabled: enabled } : m))
      );
      toast.success(enabled ? "Professor habilitado" : "Professor desabilitado");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const bulkToggle = async (enabled: boolean) => {
    setBulkLoading(true);
    try {
      const ids = filteredMembers.map((m) => m.id);
      const res = await fetch("/api/music-coach/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids, enabled, groupId: user?.groupId }),
      });
      if (!res.ok) throw new Error();
      setMembers((prev) =>
        prev.map((m) => (ids.includes(m.id) ? { ...m, coachEnabled: enabled } : m))
      );
      toast.success(`${ids.length} membros ${enabled ? "habilitados" : "desabilitados"}`);
    } catch {
      toast.error("Erro ao salvar em lote");
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.memberFunction || "").toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = members.filter((m) => m.coachEnabled).length;

  if (status === "loading" || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            Configurar Professor
          </h1>
          <p className="text-muted-foreground mt-1">
            Habilite o módulo Professor para os membros do seu grupo.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-muted-foreground">{enabledCount} de {members.length} habilitados</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros do Grupo
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkToggle(true)}
                disabled={bulkLoading}
              >
                {bulkLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Habilitar Todos
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkToggle(false)}
                disabled={bulkLoading}
              >
                Desabilitar Todos
              </Button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou função..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredMembers.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhum membro encontrado.</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.name}</p>
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {member.role}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {member.memberFunction && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
                          {member.memberFunction}
                        </span>
                      )}
                      {member.instruments.map((inst) => (
                        <span
                          key={inst}
                          className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400"
                        >
                          {inst}
                        </span>
                      ))}
                      {member.voiceType && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                          {member.voiceType}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {member.coachEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                    <Switch
                      checked={member.coachEnabled}
                      onCheckedChange={(checked) => toggleMember(member.id, checked)}
                      disabled={!!saving[member.id]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
