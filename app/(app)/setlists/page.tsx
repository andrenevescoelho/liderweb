"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ListMusic,
  Plus,
  Edit,
  Trash2,
  Loader2,
  Eye,
  Music,
  GripVertical,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ChordProViewer } from "@/components/chord-pro-viewer";
import { MUSICAL_KEYS } from "@/lib/types";

export default function SetlistsPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const canEdit = userRole === "SUPERADMIN" || userRole === "ADMIN" || userRole === "LEADER";

  const [setlists, setSetlists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editSetlist, setEditSetlist] = useState<any>(null);
  const [viewSetlist, setViewSetlist] = useState<any>(null);

  const fetchSetlists = async () => {
    try {
      const res = await fetch("/api/setlists");
      const data = await res.json();
      setSetlists(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetlists();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este repertório?")) return;
    await fetch(`/api/setlists/${id}`, { method: "DELETE" });
    fetchSetlists();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <ListMusic className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repertórios</h1>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Novo Repertório
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (setlists?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ListMusic className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Nenhum repertório encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {setlists?.map?.((setlist) => (
            <Card key={setlist?.id ?? ''} className="hover:shadow-xl transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {setlist?.name ?? ''}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {setlist?.date
                        ? format(new Date(setlist?.date), "dd 'de' MMMM, yyyy", { locale: ptBR })
                        : ''}
                    </p>
                  </div>
                  <Badge variant="info">
                    {setlist?.items?.length ?? 0} músicas
                  </Badge>
                </div>

                <div className="space-y-1 my-3">
                  {setlist?.items?.slice?.(0, 3)?.map?.((item: any, idx: number) => (
                    <div
                      key={item?.id ?? idx}
                      className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                      <span className="w-5 h-5 rounded bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-xs text-purple-600 dark:text-purple-400">
                        {idx + 1}
                      </span>
                      <span className="truncate flex-1">{item?.song?.title ?? ''}</span>
                      <Badge variant="default" className="text-xs">
                        {item?.selectedKey ?? ''}
                      </Badge>
                    </div>
                  ))}
                  {(setlist?.items?.length ?? 0) > 3 && (
                    <p className="text-xs text-gray-400">+{(setlist?.items?.length ?? 0) - 3} mais</p>
                  )}
                </div>

                <div className="flex gap-2 pt-3 border-t dark:border-gray-700">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setViewSetlist(setlist);
                      setViewModalOpen(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditSetlist(setlist);
                          setModalOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(setlist?.id ?? '')}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SetlistModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditSetlist(null);
        }}
        setlist={editSetlist}
        onSave={() => {
          setModalOpen(false);
          setEditSetlist(null);
          fetchSetlists();
        }}
      />

      <ViewSetlistModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setViewSetlist(null);
        }}
        setlist={viewSetlist}
      />
    </div>
  );
}

function SetlistModal({
  isOpen,
  onClose,
  setlist,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  setlist: any;
  onSave: () => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [songs, setSongs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedSong, setSelectedSong] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/songs")
        .then((res) => res.json())
        .then((data) => setSongs(data ?? []))
        .catch(console.error);
    }
  }, [isOpen]);

  useEffect(() => {
    if (setlist) {
      setName(setlist?.name ?? "");
      setDate(
        setlist?.date
          ? new Date(setlist?.date)?.toISOString?.()?.split?.("T")?.[0] ?? ''
          : ""
      );
      setItems(
        setlist?.items?.map?.((item: any) => ({
          songId: item?.song?.id ?? item?.songId,
          selectedKey: item?.selectedKey ?? "C",
          songTitle: item?.song?.title ?? '',
        })) ?? []
      );
    } else {
      setName("");
      setDate("");
      setItems([]);
    }
  }, [setlist]);

  const addSong = () => {
    if (!selectedSong) return;
    const song = songs?.find?.((s) => s?.id === selectedSong);
    if (!song) return;

    setItems([
      ...(items ?? []),
      {
        songId: song?.id,
        selectedKey: song?.originalKey ?? "C",
        songTitle: song?.title,
      },
    ]);
    setSelectedSong("");
  };

  const removeSong = (idx: number) => {
    setItems(items?.filter?.((_, i) => i !== idx) ?? []);
  };

  const updateKey = (idx: number, key: string) => {
    const newItems = [...(items ?? [])];
    if (newItems?.[idx]) {
      newItems[idx] = { ...newItems[idx], selectedKey: key };
    }
    setItems(newItems);
  };

  const moveItem = (from: number, to: number) => {
    const newItems = [...(items ?? [])];
    const [removed] = newItems?.splice?.(from, 1) ?? [];
    if (removed) {
      newItems?.splice?.(to, 0, removed);
    }
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setSaving(true);

    try {
      const url = setlist ? `/api/setlists/${setlist?.id}` : "/api/setlists";
      const method = setlist ? "PUT" : "POST";

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date,
          items: items?.map?.((item) => ({
            songId: item?.songId,
            selectedKey: item?.selectedKey,
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
      title={setlist ? "Editar Repertório" : "Novo Repertório"}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e?.target?.value ?? '')}
          required
        />
        <Input
          label="Data"
          type="date"
          value={date}
          onChange={(e) => setDate(e?.target?.value ?? '')}
          required
        />

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Músicas
          </label>
          <div className="flex gap-2 mb-3">
            <Select
              value={selectedSong}
              onChange={(e) => setSelectedSong(e?.target?.value ?? '')}
              options={[
                { value: "", label: "Selecione uma música" },
                ...(songs
                  ?.filter?.((s) => !items?.some?.((i) => i?.songId === s?.id))
                  ?.map?.((s) => ({ value: s?.id ?? '', label: s?.title ?? '' })) ?? []),
              ]}
              className="flex-1"
            />
            <Button type="button" onClick={addSong} disabled={!selectedSong}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {items?.map?.((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => idx > 0 && moveItem(idx, idx - 1)}
                    disabled={idx === 0}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => idx < (items?.length ?? 0) - 1 && moveItem(idx, idx + 1)}
                    disabled={idx === (items?.length ?? 0) - 1}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                  >
                    ▼
                  </button>
                </div>
                <span className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center text-xs text-white">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">
                  {item?.songTitle ?? ''}
                </span>
                <Select
                  value={item?.selectedKey ?? 'C'}
                  onChange={(e) => updateKey(idx, e?.target?.value ?? 'C')}
                  options={MUSICAL_KEYS?.slice?.(0, 17)?.map?.((k) => ({ value: k, label: k })) ?? []}
                  className="w-20"
                />
                <button
                  type="button"
                  onClick={() => removeSong(idx)}
                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
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

function ViewSetlistModal({
  isOpen,
  onClose,
  setlist,
}: {
  isOpen: boolean;
  onClose: () => void;
  setlist: any;
}) {
  const [selectedItem, setSelectedItem] = useState<any>(null);

  if (!setlist) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={setlist?.name ?? 'Repertório'}
      className="max-w-4xl"
    >
      <div className="space-y-4">
        <p className="text-gray-500">
          {setlist?.date
            ? format(new Date(setlist?.date), "dd 'de' MMMM, yyyy", { locale: ptBR })
            : ''}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 dark:text-white">Músicas</h4>
            {setlist?.items?.map?.((item: any, idx: number) => (
              <button
                key={item?.id ?? idx}
                onClick={() => setSelectedItem(item)}
                className={`w-full flex items-center gap-2 p-3 rounded-lg transition-colors ${
                  selectedItem?.id === item?.id
                    ? "bg-purple-100 dark:bg-purple-900"
                    : "bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <span className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center text-xs text-white">
                  {idx + 1}
                </span>
                <span className="flex-1 text-left text-gray-900 dark:text-white">
                  {item?.song?.title ?? ''}
                </span>
                <Badge variant="info">{item?.selectedKey ?? 'C'}</Badge>
              </button>
            ))}
          </div>

          <div>
            {selectedItem ? (
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900 dark:text-white">
                  {selectedItem?.song?.title ?? ''}
                </h4>
                {selectedItem?.song?.chordPro ? (
                  <ChordProViewer
                    chordPro={selectedItem?.song?.chordPro}
                    initialKey={selectedItem?.song?.originalKey}
                    selectedKey={selectedItem?.selectedKey}
                  />
                ) : (
                  <p className="text-gray-500">Sem cifra cadastrada</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>Selecione uma música para ver a cifra</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
