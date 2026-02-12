"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Phone,
  Music,
  Mic,
  UserPlus,
  Mail,
  Lock,
  Send,
  CheckCircle,
  Copy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { INSTRUMENTS, VOICE_TYPES, WEEKDAYS } from "@/lib/types";
import { SessionUser } from "@/lib/types";

export default function MembersPage() {
  const { data: session } = useSession() || {};
  const sessionUser = session?.user as SessionUser | undefined;
  const userRole = sessionUser?.role ?? "MEMBER";
  const canEdit = userRole === "ADMIN" || userRole === "LEADER" || userRole === "SUPERADMIN";
  const canCreate = userRole === "ADMIN" || userRole === "SUPERADMIN";

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterInstrument, setFilterInstrument] = useState("");
  const [filterVoice, setFilterVoice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [createMode, setCreateMode] = useState(false);
  
  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<{ link: string } | null>(null);
  const [inviteError, setInviteError] = useState("");

  const fetchMembers = async () => {
    try {
      let url = "/api/members?";
      if (filterInstrument) url += `instrument=${filterInstrument}&`;
      if (filterVoice) url += `voice=${filterVoice}&`;
      const res = await fetch(url);
      const data = await res.json();
      setMembers(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [filterInstrument, filterVoice]);

  const filtered = members?.filter?.((m) =>
    m?.name?.toLowerCase?.()?.includes?.(search?.toLowerCase?.() ?? '')
  ) ?? [];

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este membro?")) return;
    await fetch(`/api/members/${id}`, { method: "DELETE" });
    fetchMembers();
  };

  const handleOpenCreate = () => {
    setEditMember(null);
    setCreateMode(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (member: any) => {
    setEditMember(member);
    setCreateMode(false);
    setModalOpen(true);
  };

  const handleOpenInvite = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteSuccess(null);
    setInviteError("");
    setInviteModalOpen(true);
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      setInviteError("Email é obrigatório");
      return;
    }
    
    setInviteLoading(true);
    setInviteError("");
    
    try {
      const res = await fetch("/api/invites/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          memberName: inviteName,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setInviteError(data.error || "Erro ao enviar convite");
        return;
      }
      
      setInviteSuccess({ link: data.inviteLink });
    } catch (error) {
      setInviteError("Erro ao enviar convite");
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = () => {
    if (inviteSuccess?.link) {
      const fullLink = window.location.origin + inviteSuccess.link;
      navigator.clipboard.writeText(fullLink);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Membros</h1>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={handleOpenInvite}>
              <Send className="w-4 h-4 mr-2" />
              Convidar por Email
            </Button>
          )}
          {canCreate && (
            <Button onClick={handleOpenCreate}>
              <UserPlus className="w-4 h-4 mr-2" />
              Novo Membro
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e?.target?.value ?? '')}
            className="pl-10"
          />
        </div>
        <Select
          value={filterInstrument}
          onChange={(e) => setFilterInstrument(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Todos instrumentos" },
            ...INSTRUMENTS?.map?.((i) => ({ value: i, label: i })) ?? [],
          ]}
          className="w-48"
        />
        <Select
          value={filterVoice}
          onChange={(e) => setFilterVoice(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Todas vozes" },
            ...VOICE_TYPES?.map?.((v) => ({ value: v, label: v })) ?? [],
          ]}
          className="w-40"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (filtered?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Nenhum membro encontrado</p>
            {canCreate && (
              <Button onClick={handleOpenCreate} className="mt-4">
                <UserPlus className="w-4 h-4 mr-2" />
                Adicionar primeiro membro
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered?.map?.((member) => (
            <Card key={member?.id ?? ''} className="hover:shadow-xl transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {member?.name ?? ''}
                    </h3>
                    <p className="text-sm text-gray-500">{member?.email ?? ''}</p>
                  </div>
                  <Badge
                    variant={member?.profile?.active ? "success" : "danger"}
                  >
                    {member?.profile?.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                {member?.profile?.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <Phone className="w-4 h-4" />
                    {member?.profile?.phone}
                  </div>
                )}

                {(member?.profile?.instruments?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Music className="w-4 h-4 text-purple-600" />
                    {member?.profile?.instruments?.map?.((i: string) => (
                      <Badge key={i} variant="default">
                        {i}
                      </Badge>
                    ))}
                  </div>
                )}

                {member?.profile?.voiceType && (
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-4 h-4 text-blue-600" />
                    <Badge variant="info">{member?.profile?.voiceType}</Badge>
                  </div>
                )}

                {canEdit && (
                  <div className="flex gap-2 mt-4 pt-4 border-t dark:border-gray-700">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenEdit(member)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    {(userRole === "ADMIN" || userRole === "SUPERADMIN") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(member?.id ?? '')}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <MemberModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditMember(null);
          setCreateMode(false);
        }}
        member={editMember}
        isCreateMode={createMode}
        onSave={() => {
          setModalOpen(false);
          setEditMember(null);
          setCreateMode(false);
          fetchMembers();
        }}
      />

      {/* Invite Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Convidar Membro por Email"
      >
        {inviteSuccess ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-6 h-6" />
              <span className="font-semibold">Convite enviado com sucesso!</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Um email foi enviado para <strong>{inviteEmail}</strong> com o link de cadastro.
            </p>
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-2">Link de convite (válido por 7 dias):</p>
              <div className="flex items-center gap-2">
                <code className="text-xs flex-1 overflow-auto p-2 bg-white dark:bg-gray-900 rounded">
                  {typeof window !== 'undefined' ? window.location.origin : ''}{inviteSuccess.link}
                </code>
                <Button size="sm" variant="outline" onClick={copyInviteLink}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button onClick={() => setInviteModalOpen(false)} className="w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Envie um convite por email para que o membro se cadastre diretamente no seu grupo.
            </p>
            
            {inviteError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {inviteError}
              </div>
            )}
            
            <Input
              label="Nome do membro (opcional)"
              value={inviteName}
              onChange={(e) => setInviteName(e?.target?.value ?? '')}
              placeholder="Para personalizar o email"
            />
            
            <Input
              label="Email *"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e?.target?.value ?? '')}
              placeholder="email@exemplo.com"
              required
            />
            
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteModalOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSendInvite} disabled={inviteLoading} className="flex-1">
                {inviteLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar Convite
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MemberModal({
  isOpen,
  onClose,
  member,
  isCreateMode,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  member: any;
  isCreateMode: boolean;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [voiceType, setVoiceType] = useState("");
  const [vocalRange, setVocalRange] = useState("");
  const [comfortableKeys, setComfortableKeys] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (member) {
      setName(member?.name ?? "");
      setEmail(member?.email ?? "");
      setPhone(member?.profile?.phone ?? "");
      setInstruments(member?.profile?.instruments ?? []);
      setVoiceType(member?.profile?.voiceType ?? "");
      setVocalRange(member?.profile?.vocalRange ?? "");
      setComfortableKeys(member?.profile?.comfortableKeys ?? []);
      setAvailability(member?.profile?.availability ?? []);
      setActive(member?.profile?.active ?? true);
      setPassword("");
      setError("");
    } else {
      setName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setInstruments([]);
      setVoiceType("");
      setVocalRange("");
      setComfortableKeys([]);
      setAvailability([]);
      setActive(true);
      setError("");
    }
  }, [member, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setSaving(true);
    setError("");

    try {
      if (isCreateMode) {
        // Create new member
        if (!name || !email || !password) {
          setError("Nome, email e senha são obrigatórios");
          setSaving(false);
          return;
        }
        
        const res = await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            password,
            phone,
            instruments,
            voiceType: voiceType || null,
            vocalRange,
            comfortableKeys,
            availability,
            active,
          }),
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao criar membro");
        }
      } else {
        // Update existing member
        await fetch(`/api/members/${member?.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            instruments,
            voiceType: voiceType || null,
            vocalRange,
            comfortableKeys,
            availability,
            active,
          }),
        });
      }
      onSave();
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro ao salvar membro");
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    if (arr?.includes?.(item)) {
      setter(arr?.filter?.((i) => i !== item) ?? []);
    } else {
      setter([...(arr ?? []), item]);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isCreateMode ? "Novo Membro" : "Editar Membro"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <Input
          label="Nome *"
          value={name}
          onChange={(e) => setName(e?.target?.value ?? '')}
          required
        />
        
        {isCreateMode && (
          <>
            <Input
              label="Email *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e?.target?.value ?? '')}
              required
            />
            <Input
              label="Senha *"
              type="password"
              value={password}
              onChange={(e) => setPassword(e?.target?.value ?? '')}
              placeholder="Senha de acesso"
              required
            />
          </>
        )}
        
        <Input
          label="Telefone/WhatsApp"
          value={phone}
          onChange={(e) => setPhone(e?.target?.value ?? '')}
        />

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Instrumentos
          </label>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTS?.map?.((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => toggleItem(instruments, inst, setInstruments)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  instruments?.includes?.(inst)
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {inst}
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Tipo de Voz"
          value={voiceType}
          onChange={(e) => setVoiceType(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Selecione" },
            ...VOICE_TYPES?.map?.((v) => ({ value: v, label: v })) ?? [],
          ]}
        />

        <Input
          label="Alcance Vocal"
          value={vocalRange}
          onChange={(e) => setVocalRange(e?.target?.value ?? '')}
          placeholder="Ex: G2 - E5"
        />

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Tons Confortáveis
          </label>
          <div className="flex flex-wrap gap-2">
            {["C", "D", "E", "F", "G", "A", "B"]?.map?.((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleItem(comfortableKeys, key, setComfortableKeys)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  comfortableKeys?.includes?.(key)
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Disponibilidade
          </label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS?.map?.((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleItem(availability, day, setAvailability)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  availability?.includes?.(day)
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={active}
            onChange={(e) => setActive(e?.target?.checked ?? true)}
            className="rounded"
          />
          <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">
            Membro ativo
          </label>
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isCreateMode ? (
              "Criar Membro"
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
