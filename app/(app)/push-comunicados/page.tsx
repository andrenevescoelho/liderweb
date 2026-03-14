"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

const TYPE_OPTIONS = ["INFO", "FEATURE", "PROMOTION", "ALERT", "MAINTENANCE"];

const EMPTY_FORM = {
  title: "",
  message: "",
  type: "INFO",
  targetScope: "ALL_PLATFORM",
  targetAudience: "ALL_USERS",
  startsAt: "",
  expiresAt: "",
  isActive: true,
  ctaLabel: "",
  ctaUrl: "",
  priority: "0",
  groupIds: [] as string[],
};

export default function PushComunicadosPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const role = (session?.user as any)?.role;

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [announcementRes, groupsRes] = await Promise.all([fetch("/api/announcements"), fetch("/api/groups")]);
      const announcementData = await announcementRes.json();
      const groupsData = await groupsRes.json();
      if (!announcementRes.ok) throw new Error(announcementData.error || "Erro ao carregar comunicados");
      if (!groupsRes.ok) throw new Error(groupsData.error || "Erro ao carregar ministérios");
      setAnnouncements(announcementData.announcements ?? []);
      setGroups(groupsData ?? []);
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session || role !== "SUPERADMIN") {
      router.replace("/dashboard");
      return;
    }
    loadData();
  }, [status, role, session]);

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...form,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        priority: Number(form.priority || 0),
      };

      const res = await fetch(editingId ? `/api/announcements/${editingId}` : "/api/announcements", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar comunicado");

      setFeedback(editingId ? "Comunicado atualizado" : "Comunicado criado");
      setForm(EMPTY_FORM);
      setEditingId(null);
      await loadData();
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: any) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      message: item.message,
      type: item.type,
      targetScope: item.targetScope,
      targetAudience: item.targetAudience,
      startsAt: item.startsAt ? String(item.startsAt).slice(0, 16) : "",
      expiresAt: item.expiresAt ? String(item.expiresAt).slice(0, 16) : "",
      isActive: item.isActive,
      ctaLabel: item.ctaLabel || "",
      ctaUrl: item.ctaUrl || "",
      priority: String(item.priority || 0),
      groupIds: item.targetGroups?.map((g: any) => g.groupId) || [],
    });
  };

  if (role !== "SUPERADMIN") return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Push / Comunicados</h1>
        <p className="text-sm text-muted-foreground">Gestão global de comunicados internos (somente SUPERADMIN).</p>
      </div>

      {feedback ? <Card><CardContent className="p-4 text-sm">{feedback}</CardContent></Card> : null}

      <Card>
        <CardHeader><CardTitle>{editingId ? "Editar comunicado" : "Novo comunicado"}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input placeholder="Título" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="md:col-span-2" />
          <Textarea placeholder="Mensagem" value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} className="md:col-span-2 min-h-[120px]" />
          <Select options={TYPE_OPTIONS.map((value) => ({ value, label: value }))} value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} />
          <Select options={[{ value: "ALL_USERS", label: "Todos os usuários" }, { value: "ADMINS_ONLY", label: "Somente admins" }]} value={form.targetAudience} onChange={(e) => setForm((p) => ({ ...p, targetAudience: e.target.value }))} />
          <Select options={[{ value: "ALL_PLATFORM", label: "Todos os ministérios" }, { value: "SELECTED_GROUPS", label: "Ministérios selecionados" }]} value={form.targetScope} onChange={(e) => setForm((p) => ({ ...p, targetScope: e.target.value }))} />
          <Input type="number" placeholder="Prioridade" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
          <Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))} />
          <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          <Input placeholder="CTA label (opcional)" value={form.ctaLabel} onChange={(e) => setForm((p) => ({ ...p, ctaLabel: e.target.value }))} />
          <Input placeholder="CTA URL (opcional)" value={form.ctaUrl} onChange={(e) => setForm((p) => ({ ...p, ctaUrl: e.target.value }))} />

          {form.targetScope === "SELECTED_GROUPS" && (
            <div className="md:col-span-2 space-y-2">
              <p className="text-sm font-medium">Selecionar ministérios</p>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const selected = form.groupIds.includes(group.id);
                  return (
                    <Button
                      key={group.id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          groupIds: selected ? prev.groupIds.filter((id) => id !== group.id) : [...prev.groupIds, group.id],
                        }))
                      }
                    >
                      {group.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="md:col-span-2 flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}</Button>
            {editingId ? <Button variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancelar edição</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Comunicados cadastrados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
          {!loading && announcements.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum comunicado encontrado.</p> : null}
          {announcements.map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{item.title}</h3>
                <div className="flex gap-2">
                  <Badge>{item.type}</Badge>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.message}</p>
              <p className="text-xs text-muted-foreground">
                Público: {item.targetAudience === "ADMINS_ONLY" ? "Somente admins" : "Todos usuários"} • Escopo: {item.targetScope === "ALL_PLATFORM" ? "Todos ministérios" : "Selecionados"} • Visualizações: {item._count?.receipts ?? 0}
              </p>
              <div>
                <Button size="sm" variant="outline" onClick={() => edit(item)}>Editar</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
