"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type ProfileForm = {
  displayName: string;
  birthDate: string;
  phone: string;
  city: string;
  state: string;
  bio: string;
};

const initialForm: ProfileForm = {
  displayName: "",
  birthDate: "",
  phone: "",
  city: "",
  state: "",
  bio: "",
};



export default function ProfilePage() {
  const { data: session } = useSession() || {};
  const [form, setForm] = useState<ProfileForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSuperAdmin = (session?.user as any)?.role === "SUPERADMIN";

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/me/profile", { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao carregar perfil");
        const data = await res.json();
        setForm({
          ...initialForm,
          ...data,
        });
      } catch (error: any) {
        toast({ title: "Erro ao carregar perfil", description: error?.message ?? "Tente novamente." });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateField = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };



  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Erro ao salvar perfil");
      }

      toast({ title: "Salvo com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error?.message ?? "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando perfil...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Perfil</h1>
        <p className="text-sm text-muted-foreground">Atualize seus dados pessoais.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Informações básicas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="displayName">Nome de exibição *</Label>
              <Input id="displayName" value={form.displayName} onChange={(e) => updateField("displayName", e.target.value)} required />
            </div>
            {!isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de aniversário *</Label>
                <Input id="birthDate" type="date" value={form.birthDate} onChange={(e) => updateField("birthDate", e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">UF</Label>
              <Input id="state" maxLength={2} value={form.state} onChange={(e) => updateField("state", e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="bio">Bio / Sobre mim</Label>
              <Textarea id="bio" maxLength={2000} value={form.bio} onChange={(e) => updateField("bio", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </div>
  );
}
