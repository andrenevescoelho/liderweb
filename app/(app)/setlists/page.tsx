"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ListMusic, Loader2, Eye, Edit, Hash, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { MUSICAL_KEYS, SONG_TAGS } from "@/lib/types";

export default function SetlistsPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const canEdit = userRole === "SUPERADMIN" || userRole === "ADMIN" || userRole === "LEADER";

  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewSong, setViewSong] = useState<any>(null);
  const [editSong, setEditSong] = useState<any>(null);

  const fetchSongs = async () => {
    try {
      const res = await fetch("/api/songs");
      const data = await res.json();
      setSongs(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const groupedSongs = useMemo(() => {
    const filtered = (songs ?? []).filter((song) => {
      const term = search.toLowerCase();
      if (!term) return true;
      return (
        (song?.title ?? "").toLowerCase().includes(term) ||
        (song?.artist ?? "").toLowerCase().includes(term)
      );
    });

    return filtered.reduce((acc: Record<string, any[]>, song: any) => {
      const groupName = song?.tags?.[0] || "Sem categoria";
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(song);
      return acc;
    }, {});
  }, [songs, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ListMusic className="w-8 h-8 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repertório do Ministério</h1>
          <p className="text-sm text-gray-500">Alias das músicas usadas nas escalas</p>
        </div>
      </div>

      <Input
        placeholder="Buscar música por título ou artista..."
        value={search}
        onChange={(e) => setSearch(e?.target?.value ?? "")}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : Object.keys(groupedSongs).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-500">Nenhuma música encontrada</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSongs)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([group, list]) => (
              <div key={group} className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Tag className="w-4 h-4" /> {group}
                  <Badge variant="info">{list.length}</Badge>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((song: any) => (
                    <Card key={song?.id ?? ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{song?.title ?? ""}</p>
                            {song?.artist && <p className="text-sm text-gray-500">{song?.artist}</p>}
                          </div>
                          <Badge variant="default">{song?.originalKey ?? "C"}</Badge>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                          {song?.bpm && <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {song?.bpm} BPM</span>}
                        </div>
                        <div className="mt-3 pt-3 border-t dark:border-gray-700 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setViewSong(song)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => setEditSong(song)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <SongViewModal song={viewSong} onClose={() => setViewSong(null)} />
      <SongEditModal
        song={editSong}
        onClose={() => setEditSong(null)}
        onSaved={() => {
          setEditSong(null);
          fetchSongs();
        }}
      />
    </div>
  );
}

function SongViewModal({ song, onClose }: { song: any; onClose: () => void }) {
  if (!song) return null;

  return (
    <Modal isOpen={!!song} onClose={onClose} title={song?.title ?? "Música"} className="max-w-xl">
      <div className="space-y-2 text-sm">
        {song?.artist && <p><strong>Artista:</strong> {song?.artist}</p>}
        <p><strong>Tom:</strong> {song?.originalKey ?? "C"}</p>
        {song?.bpm && <p><strong>BPM:</strong> {song?.bpm}</p>}
        <p><strong>Compasso:</strong> {song?.timeSignature ?? "4/4"}</p>
      </div>
    </Modal>
  );
}

function SongEditModal({
  song,
  onClose,
  onSaved,
}: {
  song: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [bpm, setBpm] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!song) return;
    setTitle(song?.title ?? "");
    setArtist(song?.artist ?? "");
    setBpm(song?.bpm ? String(song.bpm) : "");
    setOriginalKey(song?.originalKey ?? "C");
    setTimeSignature(song?.timeSignature ?? "4/4");
    setTags(song?.tags ?? []);
  }, [song]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!song?.id) return;
    setSaving(true);
    try {
      await fetch(`/api/songs/${song.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          bpm,
          originalKey,
          timeSignature,
          tags,
        }),
      });
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!song) return null;

  return (
    <Modal isOpen={!!song} onClose={onClose} title="Editar música" className="max-w-xl">
      <form className="space-y-3" onSubmit={handleSave}>
        <Input label="Título" value={title} onChange={(e) => setTitle(e?.target?.value ?? "")} required />
        <Input label="Artista" value={artist} onChange={(e) => setArtist(e?.target?.value ?? "")} />
        <Input label="BPM" type="number" value={bpm} onChange={(e) => setBpm(e?.target?.value ?? "")} />
        <Select
          label="Tom"
          value={originalKey}
          onChange={(e) => setOriginalKey(e?.target?.value ?? "C")}
          options={MUSICAL_KEYS?.slice?.(0, 17)?.map?.((k) => ({ value: k, label: k })) ?? []}
        />
        <Input label="Compasso" value={timeSignature} onChange={(e) => setTimeSignature(e?.target?.value ?? "4/4")} />
        <Select
          label="Tag principal"
          value={tags?.[0] ?? ""}
          onChange={(e) => setTags(e?.target?.value ? [e?.target?.value] : [])}
          options={[
            { value: "", label: "Sem categoria" },
            ...(SONG_TAGS?.map?.((tag) => ({ value: tag, label: tag })) ?? []),
          ]}
        />
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
