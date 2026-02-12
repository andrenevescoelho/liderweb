"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SCHEDULE_ROLES } from "@/lib/types";

export default function SchedulesPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userId = (session?.user as any)?.id;
  const canEdit = userRole === "SUPERADMIN" || userRole === "ADMIN" || userRole === "LEADER";

  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<any>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  const fetchSchedules = async () => {
    try {
      const month = currentMonth?.getMonth?.() + 1;
      const year = currentMonth?.getFullYear?.();
      const res = await fetch(`/api/schedules?month=${month}&year=${year}`);
      const data = await res.json();
      setSchedules(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [currentMonth]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta escala?")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    fetchSchedules();
  };

  const handleRespond = async (scheduleId: string, roleId: string, status: string) => {
    try {
      await fetch(`/api/schedules/${scheduleId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, status }),
      });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getScheduleForDay = (day: Date) => {
    return schedules?.find?.((s) => isSameDay(new Date(s?.date ?? ''), day));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Escalas</h1>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Escala
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <CardTitle className="text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </CardTitle>
            <Button
              variant="ghost"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]?.map?.((d) => (
                  <div
                    key={d}
                    className="text-center text-sm font-medium text-gray-500 py-2"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array(startOfMonth(currentMonth)?.getDay?.() ?? 0)
                  ?.fill?.(null)
                  ?.map?.((_, i) => (
                    <div key={`empty-${i}`} className="p-2" />
                  ))}
                {days?.map?.((day) => {
                  const schedule = getScheduleForDay(day);
                  return (
                    <button
                      key={day?.toISOString?.() ?? ''}
                      onClick={() => schedule && setSelectedSchedule(schedule)}
                      className={`p-2 min-h-[80px] rounded-lg text-left transition-colors ${
                        schedule
                          ? "bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800"
                          : "bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          schedule
                            ? "text-purple-700 dark:text-purple-300"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      {schedule && (
                        <div className="mt-1">
                          <Badge variant="info" className="text-xs truncate block">
                            {schedule?.setlist?.name ?? "Escala"}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedSchedule && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                {selectedSchedule?.date
                  ? format(new Date(selectedSchedule?.date), "dd 'de' MMMM, yyyy", {
                      locale: ptBR,
                    })
                  : ''}
              </CardTitle>
              <div className="flex gap-2">
                {canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditSchedule(selectedSchedule);
                        setModalOpen(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        handleDelete(selectedSchedule?.id ?? '');
                        setSelectedSchedule(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedSchedule(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedSchedule?.setlist && (
              <div className="mb-4">
                <p className="text-sm text-gray-500">Repertório</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {selectedSchedule?.setlist?.name}
                </p>
              </div>
            )}

            <div>
              <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                <Users className="w-4 h-4" /> Equipe
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedSchedule?.roles?.map?.((role: any) => {
                  const isMe = role?.memberId === userId;
                  return (
                    <div
                      key={role?.id ?? ''}
                      className={`p-3 rounded-lg ${
                        isMe
                          ? "bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800"
                          : "bg-gray-50 dark:bg-gray-900"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {role?.role ?? ''}
                          </p>
                          <p className="text-sm text-gray-500">
                            {role?.member?.name ?? "Não atribuído"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              role?.status === "ACCEPTED"
                                ? "success"
                                : role?.status === "DECLINED"
                                ? "danger"
                                : "warning"
                            }
                          >
                            {role?.status === "ACCEPTED"
                              ? "Aceito"
                              : role?.status === "DECLINED"
                              ? "Recusado"
                              : "Pendente"}
                          </Badge>
                          {isMe && role?.status === "PENDING" && (
                            <div className="flex gap-1">
                              <button
                                onClick={() =>
                                  handleRespond(
                                    selectedSchedule?.id ?? '',
                                    role?.id ?? '',
                                    "ACCEPTED"
                                  )
                                }
                                className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() =>
                                  handleRespond(
                                    selectedSchedule?.id ?? '',
                                    role?.id ?? '',
                                    "DECLINED"
                                  )
                                }
                                className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ScheduleModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditSchedule(null);
        }}
        schedule={editSchedule}
        onSave={() => {
          setModalOpen(false);
          setEditSchedule(null);
          fetchSchedules();
        }}
      />
    </div>
  );
}

function ScheduleModal({
  isOpen,
  onClose,
  schedule,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  schedule: any;
  onSave: () => void;
}) {
  const { data: session } = useSession() || {};
  const currentRole = (session?.user as any)?.role ?? "MEMBER";

  const [date, setDate] = useState("");
  const [setlistId, setSetlistId] = useState("");
  const [roles, setRoles] = useState<any[]>([]);
  const [setlists, setSetlists] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [addRole, setAddRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/setlists").then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
    ])
      .then(([setlistsData, membersData]) => {
        setSetlists(setlistsData ?? []);
        setMembers(membersData ?? []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (schedule) {
      // Formatar data local para evitar problemas de timezone
      const d = schedule?.date ? new Date(schedule.date) : null;
      const formattedDate = d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : "";
      setDate(formattedDate);
      setSetlistId(schedule?.setlistId ?? "");
      setRoles(
        schedule?.roles?.map?.((r: any) => ({
          role: r?.role ?? '',
          memberId: r?.memberId ?? "",
          status: r?.status ?? "PENDING",
        })) ?? []
      );
    } else {
      setDate("");
      setSetlistId("");
      setRoles(
        SCHEDULE_ROLES?.map?.((r) => ({
          role: r,
          memberId: "",
          status: "PENDING",
        })) ?? []
      );
    }
  }, [schedule]);

  const updateRole = (idx: number, memberId: string) => {
    const newRoles = [...(roles ?? [])];
    if (newRoles?.[idx]) {
      newRoles[idx] = { ...newRoles[idx], memberId, status: "PENDING" };
    }
    setRoles(newRoles);
  };

  const removeRole = (idx: number) => {
    const newRoles = [...(roles ?? [])];
    newRoles.splice(idx, 1);
    setRoles(newRoles);
  };

  const addRoleToList = () => {
    const roleName = addRole === "__custom__" ? customRole.trim() : addRole;
    if (!roleName) return;

    const exists = (roles ?? []).some(
      (r) => (r?.role ?? "").toLowerCase() === roleName.toLowerCase()
    );
    if (exists) {
      alert("Esse papel já existe na escala.");
      return;
    }

    setRoles([
      ...(roles ?? []),
      {
        role: roleName,
        memberId: "",
        status: "PENDING",
      },
    ]);
    setAddRole("");
    setCustomRole("");
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setSaving(true);

    try {
      const url = schedule ? `/api/schedules/${schedule?.id}` : "/api/schedules";
      const method = schedule ? "PUT" : "POST";

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          setlistId: setlistId || null,
          roles: roles?.filter?.((r) => r?.memberId)?.map?.((r) => ({
            role: r?.role,
            memberId: r?.memberId,
            status: r?.status,
          })),
        }),
      });
      onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={schedule ? "Editar Escala" : "Nova Escala"}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Data"
          type="date"
          value={date}
          onChange={(e) => setDate(e?.target?.value ?? '')}
          required
        />

        <Select
          label="Repertório"
          value={setlistId}
          onChange={(e) => setSetlistId(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Selecione (opcional)" },
            ...(setlists?.map?.((s) => ({ value: s?.id ?? '', label: s?.name ?? '' })) ?? []),
          ]}
        />

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Atribuir Papéis
          </label>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {roles?.map?.((role, idx) => (
              <div
                key={role?.role ?? idx}
                className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <span className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {role?.role ?? ''}
                </span>
                <Select
                  value={role?.memberId ?? ''}
                  onChange={(e) => {
                    const v = e?.target?.value ?? "";
                    updateRole(idx, v);
                  }}
                  options={[
                    { value: "", label: "Não atribuído" },
                    ...(members
                      ?.filter?.((m) => m?.profile?.active)
                      ?.map?.((m) => ({ value: m?.id ?? '', label: m?.name ?? '' })) ?? []),
                  ]}
                  className="flex-1"
                />
                <button
                  type="button"
                  className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
                  title="Remover papel"
                  onClick={() => removeRole(idx)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg border p-3 bg-white dark:bg-gray-950">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Adicionar novo papel
            </div>

            <div className="flex flex-col gap-2">
              <Select
                value={addRole}
                onChange={(e) => setAddRole(e?.target?.value ?? "")}
                options={[
                  { value: "", label: "Selecione um papel" },
                  ...(SCHEDULE_ROLES
                    ?.filter?.(
                      (r) =>
                        !(roles ?? [])?.some?.(
                          (x) => (x?.role ?? "").toLowerCase() === String(r).toLowerCase()
                        )
                    )
                    ?.map?.((r) => ({ value: r, label: r })) ?? []),
                  { value: "__custom__", label: "Outro (digitar)" },
                ]}
              />

              {addRole === "__custom__" && (
                <Input
                  placeholder="Digite o nome do novo papel (ex: Backing Vocal, Violão 2...)"
                  value={customRole}
                  onChange={(e) => setCustomRole(e?.target?.value ?? "")}
                />
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addRoleToList}
                  disabled={!addRole || (addRole === "__custom__" && !customRole.trim())}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar papel
                </Button>
              </div>
            </div>
          </div>

        </div>


        <div className="flex gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
