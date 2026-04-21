"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Disc3, Plus, Search, Pencil, Loader2, CheckCircle2, Clock,
  X, Music2, AlertCircle, RefreshCw, Wand2, Trash2, ImagePlus, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Stem { name: string; r2Key: string }

interface Album {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  coverUrl: string | null;
  description: string | null;
  status: "PENDING" | "CATALOGED" | "DOWNLOADING" | "READY" | "ERROR";
  stems: Stem[];
  isActive: boolean;
  createdAt: string;
  songId: string | null;
  _count: { rentals: number };
}

const EMPTY_FORM = {
  title: "",
  artist: "",
  genre: "",
  bpm: "",
  musicalKey: "",
  coverUrl: "",
  description: "",
  driveZipUrl: "",
  songId: "",
};

export default function MultitracksAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [processingMsg, setProcessingMsg] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState("");
  const [coverResults, setCoverResults] = useState<{ url: string; thumb: string; source: string }[]>([]);
  const [searchingCover, setSearchingCover] = useState(false);
  const [songSearch, setSongSearch] = useState("");
  const [songResults, setSongResults] = useState<{ id: string; title: string; artist: string | null }[]>([]);
  const [searchingSong, setSearchingSong] = useState(false);

  // Ao colar/sair do campo de URL, tenta extrair metadados automaticamente
  const handleDriveUrlBlur = async (url: string) => {
    if (!url || !url.includes("drive.google.com")) return;
    // Só preenche se os campos ainda estiverem vazios
    const hasData = form.title || form.artist || form.bpm || form.musicalKey;
    if (hasData) return;

    setParsing(true);
    setParseMsg("Buscando informações da multitrack...");
    try {
      const res = await fetch("/api/multitracks/admin/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.parsed) {
        const { title, artist, bpm, musicalKey } = data.parsed;
        setForm((f) => ({
          ...f,
          title: title || f.title,
          artist: artist || f.artist,
          bpm: bpm ? String(bpm) : f.bpm,
          musicalKey: musicalKey || f.musicalKey,
        }));
        setParseMsg(`✓ Dados extraídos de: "${data.filename}"`);
      } else {
        setParseMsg(data.message || "Preencha os dados manualmente.");
      }
    } catch {
      setParseMsg("Não foi possível extrair dados. Preencha manualmente.");
    } finally {
      setParsing(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    if (status === "authenticated" && user && !["SUPERADMIN"].includes(user.role)) {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  const fetchAlbums = useCallback(async (q = "") => {
    try {
      setLoading(true);
      const res = await fetch(`/api/multitracks/admin?q=${encodeURIComponent(q)}`);
      if (res.ok) setAlbums((await res.json()).albums || []);
    } catch {
      toast.error("Erro ao carregar acervo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchAlbums();
  }, [status, fetchAlbums]);

  const openNew = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setCoverResults([]); };

  const openEdit = (album: Album) => {
    setForm({
      title: album.title,
      artist: album.artist,
      genre: album.genre || "",
      bpm: album.bpm ? String(album.bpm) : "",
      musicalKey: album.musicalKey || "",
      coverUrl: album.coverUrl || "",
      description: album.description || "",
      driveZipUrl: "",
      songId: album.songId || "",
    });
    setEditingId(album.id);
    setShowForm(true);
    setSongSearch("");
    setSongResults([]);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setProcessingMsg(""); setParseMsg(""); setCoverResults([]); setSongSearch(""); setSongResults([]); };

  const searchSong = async (q: string) => {
    setSongSearch(q);
    if (q.length < 2) { setSongResults([]); return; }
    setSearchingSong(true);
    try {
      const res = await fetch(`/api/songs?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSongResults((Array.isArray(data) ? data : (data?.songs ?? [])).slice(0, 8).map((s: any) => ({ id: s.id, title: s.title, artist: s.artist })));
    } catch { setSongResults([]); }
    finally { setSearchingSong(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.artist) { toast.error("Título e artista são obrigatórios"); return; }
    if (!editingId && !form.driveZipUrl) { toast.error("URL do ZIP é obrigatória"); return; }

    setSaving(true);
    setProcessingMsg("Baixando ZIP do Google Drive...");

    try {
      const payload = {
        ...form,
        bpm: form.bpm ? Number(form.bpm) : null,
        ...(editingId ? { id: editingId } : {}),
      };

      setProcessingMsg("Processando stems e enviando para o servidor...");

      const res = await fetch("/api/multitracks/admin", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar");
        return;
      }

      toast.success(
        editingId
          ? "Multitrack atualizada!"
          : `Multitrack cadastrada com ${data.stemsCount} stems!`
      );
      closeForm();
      fetchAlbums(search);
    } catch {
      toast.error("Erro ao processar");
    } finally {
      setSaving(false);
      setProcessingMsg("");
    }
  };

  const toggleActive = async (album: Album) => {
    try {
      const res = await fetch("/api/multitracks/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: album.id, isActive: !album.isActive }),
      });
      if (res.ok) {
        setAlbums((prev) => prev.map((a) => a.id === album.id ? { ...a, isActive: !a.isActive } : a));
        toast.success(album.isActive ? "Desativada" : "Ativada");
      }
    } catch { toast.error("Erro ao atualizar"); }
  };

  const deleteAlbum = async (album: Album) => {
    if (!confirm(`Tem certeza que deseja excluir "${album.title}"?\n\nEsta ação não pode ser desfeita e removerá todos os aluguéis ativos.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/multitracks/admin?id=${album.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) { toast.success("Multitrack excluída!"); fetchAlbums(search); }
      else toast.error(data.error || "Erro ao excluir");
    } catch { toast.error("Erro ao excluir"); }
    finally { setSaving(false); }
  };

  const searchCover = async () => {
    if (!form.title || !form.artist) {
      toast.error("Preencha título e artista antes de buscar a capa");
      return;
    }
    setSearchingCover(true);
    setCoverResults([]);
    try {
      const res = await fetch(`/api/multitracks/cover-search?title=${encodeURIComponent(form.title)}&artist=${encodeURIComponent(form.artist)}`);
      const data = await res.json();
      if (res.ok && data.results?.length > 0) {
        setCoverResults(data.results);
        toast.success(`${data.results.length} capas encontradas`);
      } else {
        toast.error("Nenhuma capa encontrada — adicione manualmente");
      }
    } catch {
      toast.error("Erro ao buscar capas");
    } finally {
      setSearchingCover(false);
    }
  };

  const analyzeMarkers = async (album: Album) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/multitracks/${album.id}/analyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.count} marcações detectadas!`);
        fetchAlbums(search);
      } else {
        toast.error(data.error || "Erro ao analisar");
      }
    } catch { toast.error("Erro ao analisar"); }
    finally { setSaving(false); }
  };

  const reprocess = async (album: Album) => {
    const url = prompt("URL do novo ZIP no Google Drive:");
    if (!url) return;
    setSaving(true);
    try {
      const res = await fetch("/api/multitracks/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: album.id, driveZipUrl: url }),
      });
      const data = await res.json();
      if (res.ok) { toast.success("Reprocessado com sucesso!"); fetchAlbums(search); }
      else toast.error(data.error || "Erro ao reprocessar");
    } catch { toast.error("Erro ao reprocessar"); }
    finally { setSaving(false); }
  };

  const statusBadge = (s: Album["status"]) => {
    if (s === "READY")       return <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><CheckCircle2 className="h-3 w-3" />Pronta</span>;
    if (s === "CATALOGED")   return <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400"><Clock className="h-3 w-3" />Catalogada</span>;
    if (s === "DOWNLOADING") return <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-400"><Loader2 className="h-3 w-3 animate-spin" />Baixando...</span>;
    if (s === "PENDING")     return <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400"><Clock className="h-3 w-3" />Processando</span>;
    return <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400"><AlertCircle className="h-3 w-3" />Erro</span>;
  };

  if (status === "loading" || loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Disc3 className="h-7 w-7 text-primary" />
            Acervo de Multitracks
          </h1>
          <p className="text-muted-foreground mt-1">Cadastre e gerencie o catálogo global de multitracks.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nova Multitrack</Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); fetchAlbums(search); }} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por título ou artista..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {albums.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Music2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">Nenhuma multitrack cadastrada.</p>
              <Button variant="outline" className="mt-4" onClick={openNew}>Cadastrar primeira multitrack</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {albums.map((album) => (
                <div key={album.id} className={cn("flex items-center gap-4 px-5 py-4", !album.isActive && "opacity-50")}>
                  <div className="h-12 w-12 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="h-5 w-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{album.title}</p>
                      {statusBadge(album.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{album.artist}</p>
                    <div className="flex gap-3 mt-1">
                      {album.bpm && <span className="text-[10px] text-muted-foreground">{album.bpm} BPM</span>}
                      {album.musicalKey && <span className="text-[10px] text-muted-foreground">Tom {album.musicalKey}</span>}
                      {album.genre && <span className="text-[10px] text-muted-foreground">{album.genre}</span>}
                      <span className="text-[10px] text-muted-foreground">{(album.stems?.length ?? 0)} stems</span>
                      <span className="text-[10px] text-muted-foreground">{album._count.rentals} aluguéis</span>
                      {album.songId ? (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Vinculada
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                          <AlertCircle className="h-2.5 w-2.5" /> Sem vínculo
                        </span>
                      )}
                    </div>
                    {(album.stems?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(album.stems ?? []).map((s: Stem, i: number) => (
                          <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{s.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {album.status === "READY" && (
                      <Button size="sm" variant="ghost" onClick={() => analyzeMarkers(album)} title="Detectar marcações via IA" disabled={saving}>
                        <Wand2 className="h-4 w-4 text-violet-400" />
                      </Button>
                    )}
                    {album.status === "ERROR" && (
                      <Button size="sm" variant="ghost" onClick={() => reprocess(album)} title="Reprocessar ZIP">
                        <RefreshCw className="h-4 w-4 text-amber-400" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(album)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(album)} className={album.isActive ? "text-muted-foreground" : "text-emerald-500"}>
                      {album.isActive ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteAlbum(album)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10" disabled={saving}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeForm}>
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold">{editingId ? "Editar Multitrack" : "Nova Multitrack"}</h2>
              <button onClick={closeForm} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">URL do ZIP no Google Drive *</label>
                  <div className="relative">
                    <Input
                      value={form.driveZipUrl}
                      onChange={(e) => { setForm((f) => ({ ...f, driveZipUrl: e.target.value })); setParseMsg(""); }}
                      onBlur={(e) => handleDriveUrlBlur(e.target.value)}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text");
                        setTimeout(() => handleDriveUrlBlur(pasted), 100);
                      }}
                      placeholder="https://drive.google.com/file/d/..."
                      required={!editingId}
                      className="pr-8"
                    />
                    {parsing && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                  </div>
                  {parseMsg && (
                    <p className={cn("text-xs", parseMsg.startsWith("✓") ? "text-emerald-400" : "text-muted-foreground")}>
                      {parseMsg}
                    </p>
                  )}
                  {!parseMsg && (
                    <p className="text-xs text-muted-foreground">
                      Cole o link e os dados serão preenchidos automaticamente.
                      {editingId && " Deixe em branco para manter os stems atuais."}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Título *</label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Nome da música" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Artista *</label>
                  <Input value={form.artist} onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))} placeholder="Artista / Ministério" required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tom</label>
                  <Input value={form.musicalKey} onChange={(e) => setForm((f) => ({ ...f, musicalKey: e.target.value }))} placeholder="Ex: G, Am" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">BPM</label>
                  <Input type="number" value={form.bpm} onChange={(e) => setForm((f) => ({ ...f, bpm: e.target.value }))} placeholder="Auto-detectado do CLICK" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Gênero</label>
                  <Input value={form.genre} onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))} placeholder="Ex: Gospel, Worship" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-sm font-medium">Capa do álbum</label>

                  {/* Preview + busca */}
                  <div className="flex gap-3 items-start">
                    {/* Preview */}
                    <div className="h-20 w-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center">
                      {form.coverUrl ? (
                        <img src={form.coverUrl} alt="Capa" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                      ) : (
                        <Music2 className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      {/* Input manual */}
                      <Input
                        value={form.coverUrl}
                        onChange={(e) => { setForm((f) => ({ ...f, coverUrl: e.target.value })); setCoverResults([]); }}
                        placeholder="Cole uma URL de imagem manualmente..."
                      />
                      {/* Botão buscar */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={searchCover}
                        disabled={searchingCover || !form.title || !form.artist}
                        className="w-full"
                      >
                        {searchingCover
                          ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Buscando capas...</>
                          : <><Search className="mr-2 h-3.5 w-3.5" />Buscar capa automaticamente</>}
                      </Button>
                    </div>
                  </div>

                  {/* Grid de resultados */}
                  {coverResults.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">Clique numa capa para selecioná-la:</p>
                      <div className="grid grid-cols-4 gap-2">
                        {coverResults.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => { setForm((f) => ({ ...f, coverUrl: r.url })); setCoverResults([]); toast.success("Capa selecionada!"); }}
                            className={cn(
                              "relative rounded-lg overflow-hidden border-2 transition-all hover:scale-105",
                              form.coverUrl === r.url ? "border-primary" : "border-transparent hover:border-primary/50"
                            )}
                            title={r.source}
                          >
                            <img src={r.thumb} alt={r.source} className="w-full aspect-square object-cover" />
                            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 hover:opacity-100 transition-opacity">
                              <p className="text-[8px] text-white truncate">{r.source.split("—")[0].trim()}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setCoverResults([])}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Fechar resultados
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {saving && processingMsg && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  <p className="text-sm text-primary">{processingMsg}</p>
                </div>
              )}

              {/* Vínculo com música do acervo */}
              <div className="space-y-1.5 border-t border-border pt-4">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Vincular a uma música do acervo
                </label>
                {form.songId ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">
                      {songResults.find(s => s.id === form.songId)?.title || "Música vinculada"}
                    </span>
                    <button type="button" onClick={() => { setForm(f => ({ ...f, songId: "" })); setSongSearch(""); setSongResults([]); }}
                      className="text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={songSearch}
                        onChange={(e) => searchSong(e.target.value)}
                        placeholder="Buscar música pelo título..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      {searchingSong && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                    </div>
                    {songResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                        {songResults.map(s => (
                          <button key={s.id} type="button"
                            onClick={() => { setForm(f => ({ ...f, songId: s.id })); setSongSearch(s.title); setSongResults([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2">
                            <Music2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">{s.title}</span>
                            {s.artist && <span className="text-muted-foreground truncate">— {s.artist}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {songSearch.length >= 2 && songResults.length === 0 && !searchingSong && (
                      <p className="text-xs text-muted-foreground mt-1">Nenhuma música encontrada.</p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Vincular permite que a música apareça como recurso no ensaio e na lista de músicas.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeForm} className="flex-1" disabled={saving}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</> : editingId ? "Salvar" : "Cadastrar e Processar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
