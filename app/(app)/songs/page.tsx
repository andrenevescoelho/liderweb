"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  Music,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Eye,
  Tag,
  Hash,
  Youtube,
  Headphones,
  Link as LinkIcon,
  Play,
  Upload,
  X,
  FileAudio,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ChordProViewer } from "@/components/chord-pro-viewer";
import { SONG_TAGS, MUSICAL_KEYS } from "@/lib/types";

// Função para extrair o ID do vídeo do YouTube
function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
}

export default function SongsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const canEdit =
    userRole === "ADMIN" ||
    userRole === "LEADER" ||
    userRole === "SUPERADMIN" ||
    userPermissions.includes("music.rehearsal.send") ||
    userPermissions.includes("music.submitted.edit") ||
    userPermissions.includes("setlist.music.add");

  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterKey, setFilterKey] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editSong, setEditSong] = useState<any>(null);
  const [viewSong, setViewSong] = useState<any>(null);
  const openedSongIdFromQueryRef = useRef<string | null>(null);
  const songIdFromQuery = searchParams?.get("songId") ?? "";

  const fetchSongs = async () => {
    try {
      let url = "/api/songs?";
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (filterTag) url += `tag=${filterTag}&`;
      if (filterKey) url += `key=${filterKey}&`;
      const res = await fetch(url);
      const data = await res.json();
      setSongs(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchSongs, 300);
    return () => clearTimeout(timer);
  }, [search, filterTag, filterKey]);

  useEffect(() => {
    if (
      !songIdFromQuery ||
      loading ||
      (songs?.length ?? 0) === 0 ||
      openedSongIdFromQueryRef.current === songIdFromQuery
    ) {
      return;
    }

    const selectedSong = songs.find((song) => song?.id === songIdFromQuery);
    if (!selectedSong) return;

    openedSongIdFromQueryRef.current = songIdFromQuery;
    setViewSong(selectedSong);
    setViewModalOpen(true);
  }, [songIdFromQuery, songs, loading]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta música?")) return;
    await fetch(`/api/songs/${id}`, { method: "DELETE" });
    fetchSongs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Music className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Músicas</h1>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Música
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Buscar por título ou artista..."
            value={search}
            onChange={(e) => setSearch(e?.target?.value ?? '')}
            className="pl-10"
          />
        </div>
        <Select
          value={filterTag}
          onChange={(e) => setFilterTag(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Todas tags" },
            ...SONG_TAGS?.map?.((t) => ({ value: t, label: t })) ?? [],
          ]}
          className="w-40"
        />
        <Select
          value={filterKey}
          onChange={(e) => setFilterKey(e?.target?.value ?? '')}
          options={[
            { value: "", label: "Todos tons" },
            ...MUSICAL_KEYS?.slice?.(0, 12)?.map?.((k) => ({ value: k, label: k })) ?? [],
          ]}
          className="w-32"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (songs?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Music className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Nenhuma música encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {songs?.map?.((song) => (
            <Card key={song?.id ?? ''} className="hover:shadow-xl transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {song?.title ?? ''}
                    </h3>
                    {song?.artist && (
                      <p className="text-sm text-gray-500">{song?.artist}</p>
                    )}
                  </div>
                  <Badge variant="info">{song?.originalKey ?? 'C'}</Badge>
                </div>

                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  {song?.bpm && (
                    <span className="flex items-center gap-1">
                      <Hash className="w-4 h-4" /> {song?.bpm} BPM
                    </span>
                  )}
                  <span>{song?.timeSignature ?? '4/4'}</span>
                </div>

                {/* Indicadores de mídia */}
                <div className="flex items-center gap-2 mb-3">
                  {song?.youtubeUrl && (
                    <Badge variant="danger" className="flex items-center gap-1">
                      <Youtube className="w-3 h-3" /> YouTube
                    </Badge>
                  )}
                  {song?.audioUrl && (
                    <Badge variant="success" className="flex items-center gap-1">
                      <Headphones className="w-3 h-3" /> Áudio
                    </Badge>
                  )}
                </div>

                {(song?.tags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {song?.tags?.map?.((tag: string) => (
                      <Badge key={tag} variant="default">
                        <Tag className="w-3 h-3 mr-1" /> {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t dark:border-gray-700">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setViewSong(song);
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
                          setEditSong(song);
                          setModalOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(song?.id ?? '')}
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

      <SongModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditSong(null);
        }}
        song={editSong}
        onSave={() => {
          setModalOpen(false);
          setEditSong(null);
          fetchSongs();
        }}
      />

      <Modal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setViewSong(null);
        }}
        title={viewSong?.title ?? 'Música'}
        className="max-w-3xl"
      >
        {viewSong && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              {viewSong?.artist && <span><strong>Artista:</strong> {viewSong?.artist}</span>}
              <span><strong>Tom:</strong> {viewSong?.originalKey}</span>
              {viewSong?.bpm && <span><strong>BPM:</strong> {viewSong?.bpm}</span>}
              <span><strong>Compasso:</strong> {viewSong?.timeSignature ?? '4/4'}</span>
            </div>

            {/* Player de YouTube */}
            {viewSong?.youtubeUrl && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Youtube className="w-5 h-5 text-red-500" /> Vídeo
                </h4>
                {getYoutubeEmbedUrl(viewSong.youtubeUrl) ? (
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                      src={getYoutubeEmbedUrl(viewSong.youtubeUrl) || ''}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={viewSong.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-red-500 hover:underline"
                  >
                    <LinkIcon className="w-4 h-4" /> Abrir no YouTube
                  </a>
                )}
              </div>
            )}

            {/* Player de Áudio */}
            {viewSong?.audioUrl && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Headphones className="w-5 h-5 text-green-500" /> Áudio
                </h4>
                <audio controls className="w-full">
                  <source src={viewSong.audioUrl} />
                  Seu navegador não suporta o elemento de áudio.
                </audio>
              </div>
            )}

            {viewSong?.chordPro ? (
              <ChordProViewer chordPro={viewSong?.chordPro} initialKey={viewSong?.originalKey} />
            ) : viewSong?.lyrics ? (
              <div className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                {viewSong?.lyrics}
              </div>
            ) : (
              <p className="text-gray-500">Sem cifra ou letra cadastrada</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SongModal({
  isOpen,
  onClose,
  song,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  song: any;
  onSave: () => void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [bpm, setBpm] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [tags, setTags] = useState<string[]>([]);
  const [lyrics, setLyrics] = useState("");
  const [chordPro, setChordPro] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioMode, setAudioMode] = useState<"link" | "upload">("link");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [communitySongs, setCommunitySongs] = useState<any[]>([]);
  const [loadingCommunitySongs, setLoadingCommunitySongs] = useState(false);
  const [addingSongId, setAddingSongId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (song) {
      setTitle(song?.title ?? "");
      setArtist(song?.artist ?? "");
      setBpm(song?.bpm?.toString?.() ?? "");
      setOriginalKey(song?.originalKey ?? "C");
      setTimeSignature(song?.timeSignature ?? "4/4");
      setTags(song?.tags ?? []);
      setLyrics(song?.lyrics ?? "");
      setChordPro(song?.chordPro ?? "");
      setYoutubeUrl(song?.youtubeUrl ?? "");
      setAudioUrl(song?.audioUrl ?? "");
      setAudioMode("link");
    } else {
      setTitle("");
      setArtist("");
      setBpm("");
      setOriginalKey("C");
      setTimeSignature("4/4");
      setTags([]);
      setLyrics("");
      setChordPro("");
      setYoutubeUrl("");
      setAudioUrl("");
      setAudioMode("link");
    }
    setUploading(false);
    setUploadProgress("");
  }, [song, isOpen]);

  useEffect(() => {
    if (!isOpen || song) return;

    const fetchCommunitySongs = async () => {
      setLoadingCommunitySongs(true);
      try {
        const res = await fetch("/api/songs?library=community");
        const data = await res.json();
        setCommunitySongs(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingCommunitySongs(false);
      }
    };

    fetchCommunitySongs();
  }, [isOpen, song]);

  const handleAddFromCommunity = async (sourceSongId: string) => {
    setAddingSongId(sourceSongId);
    try {
      const res = await fetch("/api/songs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSongId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error || "Não foi possível adicionar a música");
      }

      onSave();
    } catch (error: any) {
      alert(error?.message || "Erro ao adicionar música existente");
    } finally {
      setAddingSongId("");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith("audio/")) {
      alert("Por favor, selecione um arquivo de áudio.");
      return;
    }

    // Validar tamanho (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert("O arquivo deve ter no máximo 50MB.");
      return;
    }

    setUploading(true);
    setUploadProgress("Preparando upload...");

    try {
      // 1. Obter URL de upload
      const res = await fetch("/api/songs/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao preparar upload");
      }

      const { uploadUrl, publicUrl } = await res.json();

      setUploadProgress("Enviando arquivo...");

      // 2. Fazer upload para S3
      // Verificar se precisa enviar Content-Disposition no header
      const headers: Record<string, string> = {
        "Content-Type": file.type,
      };
      
      // Se a URL assinada inclui content-disposition nos headers assinados, precisamos enviar
      if (uploadUrl.includes("content-disposition")) {
        headers["Content-Disposition"] = "attachment";
      }

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Erro ao enviar arquivo");
      }

      setUploadProgress("Concluído!");
      setAudioUrl(publicUrl);

      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      alert(error.message || "Erro ao fazer upload do arquivo");
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setSaving(true);

    try {
      const url = song ? `/api/songs/${song?.id}` : "/api/songs";
      const method = song ? "PUT" : "POST";

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          bpm: bpm || null,
          originalKey,
          timeSignature,
          tags,
          lyrics,
          chordPro,
          youtubeUrl: youtubeUrl || null,
          audioUrl: audioUrl || null,
        }),
      });
      onSave();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (tags?.includes?.(tag)) {
      setTags(tags?.filter?.((t) => t !== tag) ?? []);
    } else {
      setTags([...(tags ?? []), tag]);
    }
  };

  const clearAudio = () => {
    setAudioUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={song ? "Editar Música" : "Nova Música"}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {!song && (
          <div className="space-y-3 p-4 border rounded-lg bg-purple-50/60 dark:bg-purple-900/10">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
              <Sparkles className="w-4 h-4" />
              <h4 className="font-medium">Adicionar música já cadastrada</h4>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Selecione uma música de outros grupos e adicione direto ao seu repertório.
            </p>

            {loadingCommunitySongs ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              </div>
            ) : (communitySongs?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma música compartilhada disponível no momento.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {communitySongs.map((communitySong) => (
                  <div
                    key={communitySong?.id}
                    className="min-w-[240px] max-w-[240px] border rounded-lg bg-white dark:bg-gray-900 p-3 space-y-2"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                        {communitySong?.title}
                      </p>
                      {communitySong?.artist && (
                        <p className="text-xs text-gray-500">{communitySong.artist}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Badge variant="info">{communitySong?.originalKey ?? "C"}</Badge>
                      {communitySong?.bpm && <span>{communitySong.bpm} BPM</span>}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      onClick={() => handleAddFromCommunity(communitySong?.id ?? "")}
                      disabled={!!addingSongId}
                    >
                      {addingSongId === communitySong?.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Adicionar ao repertório
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Input
          label="Título *"
          value={title}
          onChange={(e) => setTitle(e?.target?.value ?? '')}
          required
        />
        <Input
          label="Artista"
          value={artist}
          onChange={(e) => setArtist(e?.target?.value ?? '')}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="BPM"
            type="number"
            value={bpm}
            onChange={(e) => setBpm(e?.target?.value ?? '')}
          />
          <Select
            label="Tom Original"
            value={originalKey}
            onChange={(e) => setOriginalKey(e?.target?.value ?? 'C')}
            options={MUSICAL_KEYS?.slice?.(0, 17)?.map?.((k) => ({ value: k, label: k })) ?? []}
          />
          <Select
            label="Compasso"
            value={timeSignature}
            onChange={(e) => setTimeSignature(e?.target?.value ?? '4/4')}
            options={[
              { value: "4/4", label: "4/4" },
              { value: "3/4", label: "3/4" },
              { value: "6/8", label: "6/8" },
              { value: "2/4", label: "2/4" },
            ]}
          />
        </div>

        {/* Seção de Mídia */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Play className="w-4 h-4" /> Mídia
          </h4>
          
          {/* YouTube */}
          <div className="relative">
            <Youtube className="absolute left-3 top-9 w-5 h-5 text-red-500" />
            <Input
              label="Link do YouTube"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e?.target?.value ?? '')}
              placeholder="https://www.youtube.com/watch?v=..."
              className="pl-10"
            />
          </div>
          
          {/* Áudio */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Áudio
            </label>
            
            {/* Tabs para escolher modo */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAudioMode("link")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                  audioMode === "link"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                <LinkIcon className="w-4 h-4" /> Link externo
              </button>
              <button
                type="button"
                onClick={() => setAudioMode("upload")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                  audioMode === "upload"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                <Upload className="w-4 h-4" /> Upload
              </button>
            </div>

            {audioMode === "link" ? (
              <div className="relative">
                <Headphones className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                <Input
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e?.target?.value ?? '')}
                  placeholder="https://exemplo.com/audio.mp3"
                  className="pl-10"
                />
              </div>
            ) : (
              <div className="space-y-2">
                {!audioUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      uploading
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20"
                        : "border-gray-300 dark:border-gray-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                        <p className="text-sm text-purple-600">{uploadProgress}</p>
                      </div>
                    ) : (
                      <>
                        <FileAudio className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Clique para selecionar um arquivo de áudio
                        </p>
                        <p className="text-xs text-gray-500 mt-1">MP3, WAV, OGG, M4A (max 50MB)</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <FileAudio className="w-8 h-8 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Áudio carregado
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-500 truncate">
                        {audioUrl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAudio}
                      className="p-1 hover:bg-green-200 dark:hover:bg-green-800 rounded"
                    >
                      <X className="w-5 h-5 text-green-700" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Preview de áudio se houver URL */}
            {audioUrl && (
              <div className="pt-2">
                <audio controls className="w-full h-10">
                  <source src={audioUrl} />
                </audio>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {SONG_TAGS?.map?.((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  tags?.includes?.(tag)
                    ? "bg-purple-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Cifra (formato ChordPro)
          </label>
          <textarea
            value={chordPro}
            onChange={(e) => setChordPro(e?.target?.value ?? '')}
            rows={8}
            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            placeholder="[G]Santo, [D]Santo, [Em]Santo..."
          />
        </div>

        <div className="flex gap-2 pt-4 sticky bottom-0 bg-white dark:bg-gray-900 pb-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || uploading} className="flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
