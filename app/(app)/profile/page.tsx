"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { KeyRound, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MEMBER_FUNCTION_OPTIONS, PROFILE_VOICE_TYPE_OPTIONS, SKILL_LEVEL_OPTIONS } from "@/lib/member-profile";

type ProfileForm = {
  displayName: string;
  birthDate: string;
  memberFunctions: string[];
  pendingRoles: string[];
  phone: string;
  city: string;
  state: string;
  bio: string;
  profileVoiceType: string;
  vocalRangeKey: string;
  skillLevel: string;
  availability: string[];
  availabilityNotes: string;
  repertoirePrefs: string;
  avatarUrl: string;
  instagram: string;
  youtube: string;
};

const initialForm: ProfileForm = {
  displayName: "",
  birthDate: "",
  memberFunctions: [],
  pendingRoles: [],
  phone: "",
  city: "",
  state: "",
  bio: "",
  profileVoiceType: "",
  vocalRangeKey: "",
  skillLevel: "",
  availability: [],
  availabilityNotes: "",
  repertoirePrefs: "",
  avatarUrl: "",
  instagram: "",
  youtube: "",
};

const AVAILABILITY_DAY_OPTIONS = [
  { value: "monday", label: "Segunda" },
  { value: "tuesday", label: "Terça" },
  { value: "wednesday", label: "Quarta" },
  { value: "thursday", label: "Quinta" },
  { value: "friday", label: "Sexta" },
  { value: "saturday", label: "Sábado" },
  { value: "sunday", label: "Domingo" },
] as const;

export default function ProfilePage() {
  const { data: session } = useSession() || {};
  const [form, setForm] = useState<ProfileForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSuperAdmin = (session?.user as any)?.role === "SUPERADMIN";

  // Troca de senha
  const [isGoogleUser, setIsGoogleUser] = useState<boolean | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (passwordForm.newPass !== passwordForm.confirm) {
      setPasswordError("As senhas não coincidem.");
      return;
    }
    if (passwordForm.newPass.length < 8) {
      setPasswordError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.newPass }),
      });
      const data = await res.json();
      if (!res.ok) { setPasswordError(data.error || "Erro ao alterar senha"); return; }
      setPasswordSuccess(true);
      setPasswordForm({ current: "", newPass: "", confirm: "" });
    } catch {
      setPasswordError("Erro inesperado. Tente novamente.");
    } finally {
      setSavingPassword(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/me/profile", { cache: "no-store" });
        if (!res.ok) throw new Error("Falha ao carregar perfil");
        const data = await res.json();
        setForm({
          ...initialForm,
          ...data,
          memberFunctions: Array.isArray(data?.memberFunctions) ? data.memberFunctions : [],
          pendingRoles: Array.isArray(data?.pendingRoles) ? data.pendingRoles : [],
          availability: Array.isArray(data?.availability) ? data.availability : [],
        });
        setIsGoogleUser(Boolean(data.isGoogleUser));
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

  const toggleFunction = (value: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      memberFunctions: checked
        ? [...prev.memberFunctions, value]
        : prev.memberFunctions.filter((item) => item !== value),
    }));
  };

  const toggleAvailabilityDay = (value: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      availability: checked
        ? [...prev.availability, value]
        : prev.availability.filter((item) => item !== value),
    }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar perfil");

      // Recarrega para mostrar estado atualizado (pendente ou aprovado)
      const updated = await fetch("/api/me/profile", { cache: "no-store" });
      const updatedData = await updated.json();
      setForm((prev) => ({
        ...prev,
        memberFunctions: Array.isArray(updatedData?.memberFunctions) ? updatedData.memberFunctions : [],
        pendingRoles: Array.isArray(updatedData?.pendingRoles) ? updatedData.pendingRoles : [],
      }));

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
        <p className="text-sm text-muted-foreground">Atualize seus dados pessoais e ministeriais.</p>
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

        {!isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Ministério</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Funções no ministério</Label>
                  {form.pendingRoles.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <Clock className="h-3 w-3" />
                      {form.pendingRoles.length} sugestão aguardando aprovação
                    </span>
                  )}
                </div>

                {/* Roles aprovados (definidos pelo líder) */}
                {form.memberFunctions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.memberFunctions.map((v) => {
                      const label = MEMBER_FUNCTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
                      return (
                        <span
                          key={v}
                          className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                        >
                          {label}
                        </span>
                      );
                    })}
                    <span className="text-xs text-muted-foreground self-center">
                      Aprovados pelo líder
                    </span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Selecione suas funções. A sugestão será enviada ao líder para aprovação.
                </p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {MEMBER_FUNCTION_OPTIONS.map((option) => {
                    const isApproved = form.memberFunctions.includes(option.value);
                    const isPending = form.pendingRoles.includes(option.value);
                    return (
                      <label key={option.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={isApproved || isPending}
                          onCheckedChange={(checked) => toggleFunction(option.value, checked === true)}
                          // Aprovados ficam disabled — só o líder remove via Editar Membro
                          disabled={isApproved}
                          className={isApproved ? "opacity-60" : ""}
                        />
                        <span className={isApproved ? "text-muted-foreground" : ""}>
                          {option.label}
                          {isPending && (
                            <span className="ml-1 text-xs text-yellow-600 dark:text-yellow-400">
                              (pendente)
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="profileVoiceType">Voz</Label>
                  <select
                    id="profileVoiceType"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.profileVoiceType}
                    onChange={(e) => updateField("profileVoiceType", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {PROFILE_VOICE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vocalRangeKey">Tom confortável</Label>
                  <Input id="vocalRangeKey" value={form.vocalRangeKey} onChange={(e) => updateField("vocalRangeKey", e.target.value)} placeholder="Ex.: G, A, Bb" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skillLevel">Nível</Label>
                  <select
                    id="skillLevel"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.skillLevel}
                    onChange={(e) => updateField("skillLevel", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {SKILL_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Disponibilidade</Label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {AVAILABILITY_DAY_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.availability.includes(option.value)}
                        onCheckedChange={(checked) => toggleAvailabilityDay(option.value, checked === true)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Selecione os dias que você geralmente está disponível.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="availabilityNotes">Observações de disponibilidade</Label>
                <Textarea
                  id="availabilityNotes"
                  maxLength={1000}
                  value={form.availabilityNotes}
                  onChange={(e) => updateField("availabilityNotes", e.target.value)}
                  placeholder="Ex.: após 19h, domingos alternados, etc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="repertoirePrefs">Preferência de repertório</Label>
                <Textarea id="repertoirePrefs" maxLength={1000} value={form.repertoirePrefs} onChange={(e) => updateField("repertoirePrefs", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {!isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Social</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="avatarUrl">Avatar URL (https://)</Label>
                <Input id="avatarUrl" value={form.avatarUrl} onChange={(e) => updateField("avatarUrl", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram (https://)</Label>
                <Input id="instagram" value={form.instagram} onChange={(e) => updateField("instagram", e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="youtube">YouTube (https://)</Label>
                <Input id="youtube" value={form.youtube} onChange={(e) => updateField("youtube", e.target.value)} placeholder="https://..." />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>

      {/* Seção de troca de senha */}
      {isGoogleUser === false && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" />
              Alterar Senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <Input id="current-password" type="password" value={passwordForm.current} onChange={(e) => setPasswordForm(p => ({ ...p, current: e.target.value }))} placeholder="Digite sua senha atual" autoComplete="current-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input id="new-password" type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm(p => ({ ...p, newPass: e.target.value }))} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input id="confirm-password" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} placeholder="Repita a nova senha" autoComplete="new-password" />
              </div>
              {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-green-500">Senha alterada com sucesso!</p>}
              <Button type="submit" disabled={savingPassword || !passwordForm.current || !passwordForm.newPass || !passwordForm.confirm}>
                {savingPassword ? "Alterando..." : "Alterar senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isGoogleUser === true && (
        <Card className="mt-6 border-muted">
          <CardContent className="py-4 flex items-center gap-3 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4 flex-shrink-0" />
            Sua senha é gerenciada pelo Google. Para alterá-la, acesse as configurações da sua conta Google.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
