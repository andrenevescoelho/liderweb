"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileAudio, Loader2, Upload, X } from "lucide-react";

const TAGS = ["🔁 Nova", "🎯 Ajuste técnico", "🎤 Treinar vocal", "🥁 Foco na intro"];

export default function NovoEnsaioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const canManage =
    userRole === "SUPERADMIN" ||
    userRole === "ADMIN" ||
    userPermissions.includes("rehearsal.manage") ||
    userPermissions.includes("rehearsal.create") ||
    userPermissions.includes("rehearsal.edit");
  const rehearsalId = searchParams.get("rehearsalId");
  const isEditing = Boolean(rehearsalId);
  const [songsCatalog, setSongsCatalog] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    date: "",
    time: "19:30",
    location: "",
    notes: "",
    type: "GENERAL",
    estimatedMinutes: "",
    songs: [],
  });
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploadingSongIndex, setUploadingSongIndex] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  useEffect(() => {
    if (!canManage) return;

    fetch("/api/songs")
      .then((res) => res.json())
      .then((data) => setSongsCatalog(data ?? []))
      .catch(() => setSongsCatalog([]));
  }, [canManage]);

  useEffect(() => {
    if (!canManage || !rehearsalId) return;

    fetch(`/api/rehearsals/${rehearsalId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data?.id) return;

        const dateTime = data.dateTime ? new Date(data.dateTime) : null;
        const dateValue = dateTime
          ? `${dateTime.getUTCFullYear()}-${String(dateTime.getUTCMonth() + 1).padStart(2, "0")}-${String(dateTime.getUTCDate()).padStart(2, "0")}`
          : "";
        const timeValue = dateTime
          ? `${String(dateTime.getUTCHours()).padStart(2, "0")}:${String(dateTime.getUTCMinutes()).padStart(2, "0")}`
          : "19:30";

        setForm({
          date: dateValue,
          time: timeValue,
          location: data.location || "",
          notes: data.notes || "",
          type: data.type || "GENERAL",
          estimatedMinutes: data.estimatedMinutes || "",
          songs: (data.songs || []).map((song: any) => ({
            songId: song.songId || undefined,
            title: song.title || "",
            artist: song.artist || "",
            key: song.key || "",
            bpm: song.bpm || "",
            youtubeUrl: song.youtubeUrl || "",
            audioUrl: song.audioUrl || "",
            partNotes: song.partNotes || "",
            notes: song.notes || "",
            tags: song.tags || [],
          })),
        });
      })
      .catch(() => undefined);
  }, [canManage, rehearsalId]);

  const addExistingSong = (songId: string) => {
    const song = songsCatalog.find((item) => item.id === songId);
    if (!song) return;
    setForm((prev: any) => ({
      ...prev,
      songs: [...prev.songs, { songId: song.id, title: song.title, artist: song.artist, key: song.originalKey, bpm: song.bpm, youtubeUrl: song.youtubeUrl || "", audioUrl: song.audioUrl || "", tags: [] }],
    }));
  };

  const addNewSong = () => {
    setForm((prev: any) => ({ ...prev, songs: [...prev.songs, { title: "", artist: "", key: "C", bpm: "", youtubeUrl: "", audioUrl: "", tags: ["🔁 Nova"] }] }));
  };

  const updateSong = (index: number, patch: Record<string, any>) => {
    setForm((prev: any) => {
      const songs = [...prev.songs];
      songs[index] = { ...songs[index], ...patch };
      return { ...prev, songs };
    });
  };

  const handleSongAudioUpload = async (index: number, file: File) => {
    try {
      setUploadingSongIndex(index);
      setUploadProgress("Preparando upload...");

      const presignedRes = await fetch('/api/songs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });

      if (!presignedRes.ok) throw new Error('Falha ao gerar URL de upload');

      const { uploadUrl, publicUrl } = await presignedRes.json();
      setUploadProgress('Enviando arquivo...');

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Falha no upload');

      updateSong(index, { audioUrl: publicUrl });
      setUploadProgress('Upload concluído');
      setTimeout(() => setUploadProgress(''), 1500);
    } catch (error) {
      console.error('Song audio upload error:', error);
      alert('Erro ao fazer upload do áudio');
    } finally {
      setUploadingSongIndex(null);
    }
  };

  const save = async (status: "DRAFT" | "PUBLISHED") => {
    const res = await fetch(isEditing ? `/api/rehearsals/${rehearsalId}` : "/api/rehearsals", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status }),
    });

    if (!res.ok) return alert("Erro ao salvar ensaio");
    const created = await res.json();
    router.push(`/ensaios/${created.id}`);
    router.refresh();
  };

  if (!canManage) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{isEditing ? "Editar ensaio" : "Novo ensaio"}</h1>
        <p className="text-sm text-gray-500">Somente administradores podem criar ensaios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{isEditing ? "Editar ensaio" : "Novo ensaio"}</h1>

      <Card>
        <CardHeader><CardTitle>Dados gerais</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          <Input placeholder="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={[
              { value: "GENERAL", label: "🎼 Ensaio geral" },
              { value: "VOCAL", label: "🎤 Ensaio vocal" },
              { value: "BAND", label: "🥁 Ensaio banda" },
              { value: "TECHNICAL", label: "🎧 Ensaio técnico" },
              { value: "DEVOTIONAL", label: "🙏 Ensaio + devocional" },
            ]}
          />
          <Input
            type="number"
            placeholder="Tempo estimado (min)"
            value={form.estimatedMinutes}
            onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })}
          />
          <Textarea placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Repertório do ensaio</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-2">
            <Select
              value=""
              onChange={(e) => addExistingSong(e.target.value)}
              options={[{ value: "", label: "Adicionar do repertório" }, ...songsCatalog.map((song) => ({ value: song.id, label: `${song.title}${song.artist ? ` - ${song.artist}` : ""}` }))]}
            />
            <Button variant="outline" onClick={addNewSong}>Adicionar música nova no ensaio</Button>
          </div>

          <div className="space-y-2">
            {form.songs.map((song: any, index: number) => (
              <div key={`${song.songId || "new"}-${index}`} className="border rounded-md p-3 space-y-2">
                <div className="grid md:grid-cols-2 gap-2">
                  <Input placeholder="Título" value={song.title} onChange={(e) => {
                    updateSong(index, { title: e.target.value })
                  }} />
                  <Input placeholder="Artista" value={song.artist || ""} onChange={(e) => {
                    updateSong(index, { artist: e.target.value })
                  }} />
                  <Input placeholder="Tom" value={song.key || ""} onChange={(e) => {
                    updateSong(index, { key: e.target.value })
                  }} />
                  <Input placeholder="BPM" value={song.bpm || ""} onChange={(e) => {
                    updateSong(index, { bpm: e.target.value })
                  }} />
                </div>
                <Input placeholder="Parte para repetir" value={song.partNotes || ""} onChange={(e) => {
                  updateSong(index, { partNotes: e.target.value })
                }} />
                <Textarea placeholder="Observações da música" value={song.notes || ""} onChange={(e) => {
                  updateSong(index, { notes: e.target.value })
                }} />
                <Input
                  placeholder="Link do YouTube da música"
                  value={song.youtubeUrl || ""}
                  onChange={(e) => updateSong(index, { youtubeUrl: e.target.value })}
                />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Link de áudio (opcional)"
                      value={song.audioUrl || ""}
                      onChange={(e) => updateSong(index, { audioUrl: e.target.value })}
                    />
                    <Button type="button" variant="outline" onClick={() => fileInputRefs.current[index]?.click()}>
                      <Upload className="w-4 h-4 mr-1" /> Upload
                    </Button>
                    <input
                      ref={(el) => { fileInputRefs.current[index] = el; }}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSongAudioUpload(index, file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                  {uploadingSongIndex === index && (
                    <div className="text-xs text-purple-600 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> {uploadProgress || "Enviando..."}</div>
                  )}
                  {song.audioUrl && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <FileAudio className="w-4 h-4" />
                      <span className="truncate">{song.audioUrl}</span>
                      <button type="button" onClick={() => updateSong(index, { audioUrl: "" })}><X className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((tag) => {
                    const active = (song.tags || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`text-xs px-2 py-1 rounded-full border ${active ? "bg-purple-600 text-white" : "bg-white"}`}
                        onClick={() => {
                          const songs = [...form.songs];
                          const tags = new Set(songs[index].tags || []);
                          if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
                          songs[index].tags = Array.from(tags);
                          setForm({ ...form, songs });
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (index === 0) return;
                      const songs = [...form.songs];
                      [songs[index - 1], songs[index]] = [songs[index], songs[index - 1]];
                      setForm({ ...form, songs });
                    }}
                  >↑</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (index === form.songs.length - 1) return;
                      const songs = [...form.songs];
                      [songs[index + 1], songs[index]] = [songs[index], songs[index + 1]];
                      setForm({ ...form, songs });
                    }}
                  >↓</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => save("DRAFT")}>Salvar rascunho</Button>
        <Button onClick={() => save("PUBLISHED")}>Publicar ensaio</Button>
      </div>
    </div>
  );
}
