"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
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

const MEMBER_ROLE_HINTS: Record<string, string[]> = {
  vocal: ["Vocal"],
  ministro: ["Ministro"],
  violão: ["Violão"],
  guitarra: ["Guitarra"],
  baixo: ["Baixo"],
  bateria: ["Bateria"],
  teclado: ["Teclado", "Piano"],
  piano: ["Piano", "Teclado"],
  violino: ["Violino"],
  flauta: ["Flauta"],
  gaita: ["Gaita"],
  percussão: ["Percussão"],
  sonoplasta: ["Sonoplasta"],
  "operador de projeção": ["Operador de projeção"],
  saxofone: ["Saxofone"],
};

export default function SchedulesPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const userId = (session?.user as any)?.id;
  const canEdit =
    userRole === "SUPERADMIN" ||
    userRole === "ADMIN" ||
    userRole === "LEADER" ||
    userPermissions.includes("schedule.create") ||
    userPermissions.includes("schedule.edit");

  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<any>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const scheduleIdFromQuery = searchParams?.get("scheduleId") ?? "";

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

  useEffect(() => {
    if (!scheduleIdFromQuery || loading) return;

    const scheduleInCurrentMonth = schedules.find((schedule) => schedule?.id === scheduleIdFromQuery);
    if (scheduleInCurrentMonth) {
      setSelectedSchedule(scheduleInCurrentMonth);
      return;
    }

    fetch(`/api/schedules/${scheduleIdFromQuery}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((schedule) => {
        if (schedule?.id) {
          setSelectedSchedule(schedule);
        }
      })
      .catch(() => {});
  }, [scheduleIdFromQuery, schedules, loading]);

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

  const formatScheduleSongs = (schedule: any) => {
    const songs = (schedule?.setlist?.items ?? [])
      .map((item: any) => item?.song?.title)
      .filter(Boolean) as string[];

    if (songs.length === 0) {
      return {
        previewSongs: [] as string[],
        remainingSongs: 0,
        preview: "Sem músicas definidas",
        fullPreview: "Sem músicas definidas",
        countLabel: "0 músicas",
      };
    }

    const previewSongs = songs.slice(0, 5);
    const remaining = songs.length - previewSongs.length;

    return {
      previewSongs,
      remainingSongs: remaining,
      preview: `${previewSongs.join(" • ")}${remaining > 0 ? ` • +${remaining}` : ""}`,
      fullPreview: songs.join(" • "),
      countLabel: `${songs.length} música${songs.length > 1 ? "s" : ""}`,
    };
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
                          <Badge
                            variant="info"
                            className="text-xs truncate block"
                            title={`${formatScheduleSongs(schedule).fullPreview} · ${formatScheduleSongs(schedule).countLabel}`}
                          >
                            {formatScheduleSongs(schedule).preview}
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
                <p className="text-sm text-gray-500">Músicas da escala</p>
                {(() => {
                  const songsData = formatScheduleSongs(selectedSchedule);

                  if (songsData.previewSongs.length === 0) {
                    return (
                      <p className="font-medium text-gray-900 dark:text-white">
                        Sem músicas definidas
                      </p>
                    );
                  }

                  return (
                    <ul className="mt-1 space-y-1.5">
                      {songsData.previewSongs.map((songTitle: string, index: number) => (
                        <li
                          key={`${songTitle}-${index}`}
                          className="flex items-center gap-2 text-sm text-gray-900 dark:text-white"
                          title={songTitle}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
                          <span className="truncate">{songTitle}</span>
                        </li>
                      ))}
                      {songsData.remainingSongs > 0 && (
                        <li className="text-sm text-gray-500 dark:text-gray-400 pl-3.5">
                          +{songsData.remainingSongs} música{songsData.remainingSongs > 1 ? "s" : ""}
                        </li>
                      )}
                    </ul>
                  );
                })()}
                <p className="text-xs text-gray-500 mt-2">{formatScheduleSongs(selectedSchedule).countLabel}</p>
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
        schedules={schedules}
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
  schedules,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  schedule: any;
  schedules: any[];
  onSave: () => void;
}) {
  const { data: session } = useSession() || {};
  const currentRole = (session?.user as any)?.role ?? "MEMBER";

  const [date, setDate] = useState("");
  const [setlistItems, setSetlistItems] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [songs, setSongs] = useState<any[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [addRole, setAddRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [showAddRoleForm, setShowAddRoleForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showNewSongModal, setShowNewSongModal] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState("");
  const [newSongArtist, setNewSongArtist] = useState("");
  const [newSongBpm, setNewSongBpm] = useState("");
  const [newSongYoutubeUrl, setNewSongYoutubeUrl] = useState("");
  const [newSongOriginalKey, setNewSongOriginalKey] = useState("C");
  const [creatingSong, setCreatingSong] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/songs").then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
    ])
      .then(([songsData, membersData]) => {
        setSongs(songsData ?? []);
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
      setSetlistItems(
        schedule?.setlist?.items?.map?.((item: any) => ({
          songId: item?.songId,
          songTitle: item?.song?.title,
          selectedKey: item?.selectedKey ?? item?.song?.originalKey ?? "C",
        })) ?? []
      );
      setRoles(
        schedule?.roles?.map?.((r: any) => ({
          role: r?.role ?? '',
          memberId: r?.memberId ?? "",
          status: r?.status ?? "PENDING",
        })) ?? []
      );
    } else {
      setDate("");
      setSetlistItems([]);
      setRoles(
        SCHEDULE_ROLES?.map?.((r) => ({
          role: r,
          memberId: "",
          status: "PENDING",
        })) ?? []
      );
    }

    setShowNewSongModal(false);
    setNewSongTitle("");
    setNewSongArtist("");
    setNewSongBpm("");
    setNewSongYoutubeUrl("");
    setNewSongOriginalKey("C");
    setShowAddRoleForm(false);
    setAddRole("");
    setCustomRole("");
  }, [schedule]);

  const updateRole = (idx: number, memberId: string) => {
    const newRoles = [...(roles ?? [])];
    if (newRoles?.[idx]) {
      newRoles[idx] = { ...newRoles[idx], memberId, status: "PENDING" };
    }
    setRoles(newRoles);
  };

  const addSongToSchedule = () => {
    if (!selectedSongId) return;
    const song = songs?.find?.((s) => s?.id === selectedSongId);
    if (!song) return;

    setSetlistItems([
      ...(setlistItems ?? []),
      {
        songId: song?.id,
        songTitle: song?.title,
        selectedKey: song?.originalKey ?? "C",
      },
    ]);
    setSelectedSongId("");
  };


  const removeSongFromSchedule = (idx: number) => {
    setSetlistItems((setlistItems ?? []).filter((_: any, i: number) => i !== idx));
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
    setShowAddRoleForm(false);
  };


  const suggestScale = () => {
    const roleFrequency = new Map<string, Map<string, number>>();

    (schedules ?? []).forEach((existingSchedule) => {
      (existingSchedule?.roles ?? []).forEach((roleEntry: any) => {
        const roleName = roleEntry?.role;
        const memberId = roleEntry?.memberId;
        if (!roleName || !memberId) return;

        const frequencyByRole = roleFrequency.get(roleName) ?? new Map<string, number>();
        frequencyByRole.set(memberId, (frequencyByRole.get(memberId) ?? 0) + 1);
        roleFrequency.set(roleName, frequencyByRole);
      });
    });

    const activeMembers = (members ?? []).filter((m) => m?.profile?.active);

    const nextRoles = (roles ?? []).map((roleEntry) => {
      const roleName = roleEntry?.role ?? "";
      const byHistory = roleFrequency.get(roleName);

      if (byHistory && byHistory.size > 0) {
        let selectedMemberId = "";
        let selectedCount = -1;

        byHistory.forEach((count, memberId) => {
          if (count > selectedCount) {
            selectedMemberId = memberId;
            selectedCount = count;
          }
        });

        if (selectedMemberId) {
          return { ...roleEntry, memberId: selectedMemberId, status: "PENDING" };
        }
      }

      const normalizedRoleName = roleName.toLowerCase();
      const suggestedByFunction = activeMembers.find((member) => {
        const memberFunction = String(member?.profile?.memberFunction ?? "").toLowerCase();
        const instruments = (member?.profile?.instruments ?? []).map((inst: string) => String(inst).toLowerCase());
        const hints = MEMBER_ROLE_HINTS[memberFunction] ?? [];

        return (
          hints.some((hint) => hint.toLowerCase() === normalizedRoleName) ||
          instruments.includes(normalizedRoleName)
        );
      });

      if (suggestedByFunction?.id) {
        return { ...roleEntry, memberId: suggestedByFunction.id, status: "PENDING" };
      }

      return roleEntry;
    });

    setRoles(nextRoles);
  };

  const createSongAndAddToSchedule = async () => {
    if (!newSongTitle.trim()) return;

    setCreatingSong(true);
    try {
      const response = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSongTitle.trim(),
          artist: newSongArtist.trim() || null,
          bpm: newSongBpm.trim() || null,
          youtubeUrl: newSongYoutubeUrl.trim() || null,
          originalKey: newSongOriginalKey,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao criar música");
      }

      const createdSong = await response.json();

      setSongs((prev) => [...(prev ?? []), createdSong].sort((a, b) => String(a?.title ?? "").localeCompare(String(b?.title ?? ""))));
      setSetlistItems((prev) => [
        ...(prev ?? []),
        {
          songId: createdSong?.id,
          songTitle: createdSong?.title,
          selectedKey: createdSong?.originalKey ?? "C",
        },
      ]);

      setNewSongTitle("");
      setNewSongArtist("");
      setNewSongBpm("");
      setNewSongYoutubeUrl("");
      setNewSongOriginalKey("C");
      setShowNewSongModal(false);
    } catch (error) {
      console.error(error);
      alert("Não foi possível criar a música agora.");
    } finally {
      setCreatingSong(false);
    }
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
          setlistItems: setlistItems?.map?.((item) => ({
            songId: item?.songId,
            selectedKey: item?.selectedKey,
          })),
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

  const musicalKeyOptions = useMemo(() => ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"], []);

  return (
    <>
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

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Músicas da Escala
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            <Select
              value={selectedSongId}
              onChange={(e) => setSelectedSongId(e?.target?.value ?? "")}
              options={[
                { value: "", label: "Selecione uma música" },
                ...(songs
                  ?.filter?.((song) => !(setlistItems ?? []).some((item) => item?.songId === song?.id))
                  ?.map?.((song) => ({ value: song?.id ?? "", label: song?.title ?? "" })) ?? []),
              ]}
              className="flex-1 min-w-[220px]"
            />
            <Button type="button" onClick={addSongToSchedule} disabled={!selectedSongId}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowNewSongModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova música
            </Button>
          </div>


          <div className="space-y-2 max-h-52 overflow-y-auto">
            {(setlistItems ?? []).map((item, idx) => (
              <div key={`${item?.songId ?? "song"}-${idx}`} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <span className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center text-xs text-white">{idx + 1}</span>
                <span className="flex-1 text-sm truncate">{item?.songTitle ?? "Música sem nome"}</span>
                <button
                  type="button"
                  onClick={() => removeSongFromSchedule(idx)}
                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Atribuir Papéis
          </label>
          <div className="mb-2 flex justify-end">
            <Button type="button" variant="secondary" onClick={suggestScale}>
              Sugerir escala
            </Button>
          </div>
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

          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowAddRoleForm((prev) => !prev);
                if (showAddRoleForm) {
                  setAddRole("");
                  setCustomRole("");
                }
              }}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {showAddRoleForm ? "Fechar" : "Adicionar papel"}
            </Button>

            {showAddRoleForm && (
              <div className="mt-2 rounded-lg border p-3 bg-white dark:bg-gray-950 space-y-2">
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
                    { value: "__custom__", label: "Informar nome do papel" },
                  ]}
                />

                {addRole === "__custom__" && (
                  <Input
                    placeholder="Digite o nome do novo papel (ex: Backing Vocal, Violão 2...)"
                    value={customRole}
                    onChange={(e) => setCustomRole(e?.target?.value ?? "")}
                  />
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddRoleForm(false);
                      setAddRole("");
                      setCustomRole("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={addRoleToList}
                    disabled={!addRole || (addRole === "__custom__" && !customRole.trim())}
                  >
                    Salvar papel
                  </Button>
                </div>
              </div>
            )}
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
      <Modal
        isOpen={showNewSongModal}
        onClose={() => setShowNewSongModal(false)}
        title="Nova Música"
        className="max-w-xl"
      >
        <div className="space-y-4">
          <Input
            label="Título da nova música"
            value={newSongTitle}
            onChange={(e) => setNewSongTitle(e?.target?.value ?? "")}
            placeholder="Digite o nome da música"
          />
          <Input
            label="Artista"
            value={newSongArtist}
            onChange={(e) => setNewSongArtist(e?.target?.value ?? "")}
            placeholder="Nome do artista"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="BPM"
              type="number"
              value={newSongBpm}
              onChange={(e) => setNewSongBpm(e?.target?.value ?? "")}
              placeholder="Ex: 120"
            />
            <Select
              label="Tom original"
              value={newSongOriginalKey}
              onChange={(e) => setNewSongOriginalKey(e?.target?.value ?? "C")}
              options={musicalKeyOptions.map((k) => ({ value: k, label: k }))}
            />
          </div>
          <Input
            label="Link do YouTube"
            value={newSongYoutubeUrl}
            onChange={(e) => setNewSongYoutubeUrl(e?.target?.value ?? "")}
            placeholder="https://www.youtube.com/watch?v=..."
          />

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowNewSongModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="button" onClick={createSongAndAddToSchedule} disabled={!newSongTitle.trim() || creatingSong} className="flex-1">
              {creatingSong ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Salvar e adicionar
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}
