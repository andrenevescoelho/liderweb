"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Search, Users, GraduationCap, CheckCircle2, XCircle } from "lucide-react";

export default function ProfessorConfigPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/professor/settings");
      if (!res.ok) throw new Error("Sem permissão para configurar o módulo");
      const data = await res.json();
      setSettings({
        ...data,
        enabled: true,
        accessMode: "SELECTED_MEMBERS",
      });
    } catch (error: any) {
      alert(error?.message ?? "Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sortedMembers = useMemo(
    () => (settings?.members ?? []).slice().sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [settings]
  );

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedMembers;

    return sortedMembers.filter((member: any) => {
      const haystack = `${member.name} ${member.email ?? ""} ${member.memberFunction ?? ""} ${member.role ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [search, sortedMembers]);

  const enabledCount = useMemo(
    () => sortedMembers.filter((member: any) => Boolean(member.enabled)).length,
    [sortedMembers]
  );

  const setAllMembers = (enabled: boolean) => {
    setSettings((prev: any) => ({
      ...prev,
      enabled: true,
      accessMode: "SELECTED_MEMBERS",
      members: (prev?.members ?? []).map((member: any) => ({ ...member, enabled })),
    }));
  };

  const save = async () => {
    try {
      setSaving(true);
      const memberIds = sortedMembers.filter((member: any) => member.enabled).map((member: any) => member.id);

      const res = await fetch("/api/professor/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          accessMode: "SELECTED_MEMBERS",
          memberIds,
        }),
      });

      if (!res.ok) throw new Error("Erro ao salvar configuração");
      await load();
      alert("Configuração salva com sucesso.");
    } catch (error: any) {
      alert(error?.message ?? "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p>Carregando configuração do Professor...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Configurar Professor</h1>
        </div>
        <p className="text-muted-foreground">Habilite o módulo Professor para os membros do seu grupo.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Membros do Grupo</CardTitle>
            <Badge variant="outline" className="ml-1">{enabledCount} de {sortedMembers.length} habilitados</Badge>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAllMembers(true)}>Habilitar Todos</Button>
            <Button type="button" variant="outline" onClick={() => setAllMembers(false)}>Desabilitar Todos</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, email ou função..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {filteredMembers.map((member: any) => {
              const active = Boolean(member.enabled);
              return (
                <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-base font-medium text-foreground">{member.name}</p>
                      <Badge variant="secondary">{member.role}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{member.email ?? member.memberFunction ?? "Sem e-mail cadastrado"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {active ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <Switch
                      checked={active}
                      onCheckedChange={(checked) => {
                        setSettings((prev: any) => ({
                          ...prev,
                          enabled: true,
                          accessMode: "SELECTED_MEMBERS",
                          members: prev.members.map((item: any) => (item.id === member.id ? { ...item, enabled: checked === true } : item)),
                        }));
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {filteredMembers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum membro encontrado.</p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
