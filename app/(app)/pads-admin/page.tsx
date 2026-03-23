"use client";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Plus, Loader2, Pencil, Trash2, X, Music2, Upload,
  Grid3x3, Disc3, ChevronDown, ChevronUp,
} from "lucide-react";

interface Pad {
  id: string; boardId: string; name: string; position: number;
  type: "HOLD" | "LOOP" | "ONE_SHOT"; audioUrl: string | null;
  color: string; volume: number; midiNote: number | null;
  keyboardKey: string | null; loopSync: boolean; isActive: boolean;
}
interface PadBoard {
  id: string; name: string; description: string | null; bpm: number | null;
  musicalKey: string | null; color: string; isActive: boolean;
  cols: number; rows: number; pads: Pad[];
}

const PAD_COLORS = [
  "#6366F1","#8B5CF6","#EC4899","#EF4444","#F97316",
  "#F59E0B","#10B981","#06B6D4","#3B82F6","#84CC16",
];

const TYPE_LABELS = { HOLD: "Contínuo (Hold)", LOOP: "Loop (Toggle)", ONE_SHOT: "One Shot" };

const EMPTY_BOARD = { name: "", description: "", bpm: "", musicalKey: "", color: "#8B5CF6", cols: "4", rows: "4" };

export default function PadsAdminPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [boards, setBoards] = useState<PadBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [editingBoard, setEditingBoard] = useState<PadBoard | null>(null);
  const [boardForm, setBoardForm] = useState(EMPTY_BOARD);
  const [expandedBoard, setExpandedBoard] = useState<string | null>(null);
  const [editingPad, setEditingPad] = useState<{ boardId: string; position: number } | null>(null);
  const [padForm, setPadForm] = useState({
    name: "", type: "ONE_SHOT", color: "#6366F1", volume: "1",
    midiNote: "", keyboardKey: "", loopSync: false,
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [recordingKey, setRecordingKey] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (user?.role !== "SUPERADMIN") { router.replace("/dashboard"); return; }
    fetchBoards();
  }, [status]);

  const fetchBoards = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pads");
      const data = await res.json();
      setBoards(data.boards || []);
    } catch { toast.error("Erro ao carregar boards"); }
    finally { setLoading(false); }
  };

  const saveBoard = async () => {
    if (!boardForm.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/pads", {
        method: editingBoard ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingBoard?.id, ...boardForm, bpm: boardForm.bpm || null, cols: Number(boardForm.cols), rows: Number(boardForm.rows) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editingBoard ? "Board atualizado!" : "Board criado!");
      setShowBoardForm(false); setEditingBoard(null); setBoardForm(EMPTY_BOARD);
      fetchBoards();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteBoard = async (id: string, name: string) => {
    if (!confirm(`Excluir board "${name}" e todos os pads?`)) return;
    setSaving(true);
    try {
      await fetch(`/api/pads?id=${id}`, { method: "DELETE" });
      toast.success("Board excluído!"); fetchBoards();
    } catch { toast.error("Erro ao excluir"); }
    finally { setSaving(false); }
  };

  const openPadEditor = (boardId: string, position: number, board: PadBoard) => {
    const existing = board.pads.find(p => p.position === position);
    setEditingPad({ boardId, position });
    setPadForm({
      name: existing?.name || `Pad ${position + 1}`,
      type: existing?.type || "ONE_SHOT",
      color: existing?.color || PAD_COLORS[position % PAD_COLORS.length],
      volume: String(existing?.volume ?? 1),
      midiNote: existing?.midiNote != null ? String(existing.midiNote) : "",
      keyboardKey: existing?.keyboardKey || "",
      loopSync: existing?.loopSync || false,
    });
    setAudioFile(null);
  };

  const savePad = async () => {
    if (!editingPad) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("boardId", editingPad.boardId);
      fd.append("position", String(editingPad.position));
      fd.append("name", padForm.name);
      fd.append("type", padForm.type);
      fd.append("color", padForm.color);
      fd.append("volume", padForm.volume);
      fd.append("midiNote", padForm.midiNote);
      fd.append("keyboardKey", padForm.keyboardKey);
      fd.append("loopSync", String(padForm.loopSync));
      if (audioFile) fd.append("audio", audioFile);

      const res = await fetch("/api/pads/pad", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Pad salvo!");
      setEditingPad(null);
      fetchBoards();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deletePad = async (padId: string) => {
    if (!confirm("Remover este pad e seu áudio?")) return;
    await fetch(`/api/pads/pad?id=${padId}`, { method: "DELETE" });
    toast.success("Pad removido!"); fetchBoards();
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Grid3x3 className="h-7 w-7 text-primary" />
            Pads & Loops
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gerencie boards de pads para uso ao vivo.</p>
        </div>
        <Button onClick={() => { setShowBoardForm(true); setEditingBoard(null); setBoardForm(EMPTY_BOARD); }}>
          <Plus className="h-4 w-4 mr-2" />Novo Board
        </Button>
      </div>

      {/* Board form */}
      {showBoardForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editingBoard ? "Editar Board" : "Novo Board"}</h2>
              <button onClick={() => setShowBoardForm(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                <Input value={boardForm.name} onChange={e => setBoardForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Pads Gospel, FX Worship" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Colunas (2-8)</label>
                <Input type="number" min={2} max={8} value={boardForm.cols} onChange={e => setBoardForm(f => ({ ...f, cols: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Linhas (2-8)</label>
                <Input type="number" min={2} max={8} value={boardForm.rows} onChange={e => setBoardForm(f => ({ ...f, rows: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">BPM (opcional)</label>
                <Input type="number" value={boardForm.bpm} onChange={e => setBoardForm(f => ({ ...f, bpm: e.target.value }))} placeholder="120" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tom (opcional)</label>
                <Input value={boardForm.musicalKey} onChange={e => setBoardForm(f => ({ ...f, musicalKey: e.target.value }))} placeholder="G, Am..." />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cor do board</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PAD_COLORS.map(c => (
                    <button key={c} onClick={() => setBoardForm(f => ({ ...f, color: c }))}
                      className={cn("h-6 w-6 rounded-full border-2", boardForm.color === c ? "border-white" : "border-transparent")}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveBoard} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingBoard ? "Salvar" : "Criar Board"}
              </Button>
              <Button variant="outline" onClick={() => setShowBoardForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de boards */}
      {boards.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Grid3x3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/20" /><p className="text-muted-foreground">Nenhum board criado ainda.</p></CardContent></Card>
      ) : boards.map(board => {
        const totalPads = board.cols * board.rows;
        const filledPads = board.pads.filter(p => p.audioUrl).length;
        const isExpanded = expandedBoard === board.id;

        return (
          <Card key={board.id} className={cn("transition-all", !board.isActive && "opacity-50")}>
            <CardContent className="p-0">
              {/* Board header */}
              <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setExpandedBoard(isExpanded ? null : board.id)}>
                <div className="h-10 w-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: board.color + "30", border: `2px solid ${board.color}50` }}>
                  <Grid3x3 className="h-5 w-5" style={{ color: board.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{board.name}</p>
                    {!board.isActive && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded">Inativo</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {board.cols}×{board.rows} pads · {filledPads}/{totalPads} com áudio
                    {board.bpm ? ` · ${board.bpm} BPM` : ""}
                    {board.musicalKey ? ` · ${board.musicalKey}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingBoard(board); setBoardForm({ name: board.name, description: board.description || "", bpm: board.bpm ? String(board.bpm) : "", musicalKey: board.musicalKey || "", color: board.color, cols: String(board.cols), rows: String(board.rows) }); setShowBoardForm(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteBoard(board.id, board.name)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Grid de pads */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border/50 pt-4">
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${board.cols}, 1fr)` }}>
                    {Array.from({ length: totalPads }).map((_, pos) => {
                      const pad = board.pads.find(p => p.position === pos);
                      return (
                        <div
                          key={pos}
                          onClick={() => openPadEditor(board.id, pos, board)}
                          className={cn(
                            "relative aspect-square rounded-xl border-2 cursor-pointer transition-all hover:scale-105 hover:shadow-lg flex flex-col items-center justify-center p-2 text-center group",
                            pad?.audioUrl ? "border-opacity-60" : "border-dashed border-border hover:border-primary/50"
                          )}
                          style={pad?.audioUrl ? { backgroundColor: pad.color + "20", borderColor: pad.color + "60" } : {}}
                        >
                          {pad?.audioUrl ? (
                            <>
                              <div className="h-5 w-5 rounded-full mb-1" style={{ backgroundColor: pad.color }} />
                              <p className="text-[10px] font-semibold truncate w-full" style={{ color: pad.color }}>{pad.name}</p>
                              <p className="text-[9px] text-muted-foreground">{TYPE_LABELS[pad.type].split(" ")[0]}</p>
                              {pad.midiNote != null && <p className="text-[8px] text-muted-foreground/50">MIDI {pad.midiNote}</p>}
                              {pad.keyboardKey && <p className="text-[8px] text-muted-foreground/50 uppercase">[{pad.keyboardKey}]</p>}
                              <button
                                onClick={e => { e.stopPropagation(); deletePad(pad.id); }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-red-400" />
                              </button>
                            </>
                          ) : (
                            <>
                              <Plus className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                              <p className="text-[9px] text-muted-foreground/40 mt-0.5">{pos + 1}</p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Modal de edição de pad */}
      {editingPad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-bold">Configurar Pad {editingPad.position + 1}</h2>
              <button onClick={() => setEditingPad(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Nome */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome do pad</label>
                <Input value={padForm.name} onChange={e => setPadForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Pad Strings, Loop Kick" />
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["ONE_SHOT", "HOLD", "LOOP"] as const).map(t => (
                    <button key={t} onClick={() => setPadForm(f => ({ ...f, type: t }))}
                      className={cn("rounded-lg border py-2 px-2 text-xs font-medium transition-all", padForm.type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50")}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Áudio */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Arquivo de áudio</label>
                <div
                  onClick={() => audioInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  {audioFile ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-primary">
                      <Music2 className="h-4 w-4" />
                      <span className="truncate max-w-[200px]">{audioFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="h-6 w-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">Clique para selecionar WAV, MP3, OGG</p>
                    </div>
                  )}
                </div>
                <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
                  onChange={e => setAudioFile(e.target.files?.[0] || null)} />
              </div>

              {/* Cor */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cor</label>
                <div className="flex gap-1.5 flex-wrap">
                  {PAD_COLORS.map(c => (
                    <button key={c} onClick={() => setPadForm(f => ({ ...f, color: c }))}
                      className={cn("h-7 w-7 rounded-full border-2 transition-all", padForm.color === c ? "border-white scale-110" : "border-transparent")}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              {/* MIDI Note */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nota MIDI (0-127)</label>
                  <Input type="number" min={0} max={127} value={padForm.midiNote}
                    onChange={e => setPadForm(f => ({ ...f, midiNote: e.target.value }))}
                    placeholder="Ex: 36 (C2)" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tecla do teclado</label>
                  <div className="relative">
                    <Input
                      value={recordingKey ? "Pressione..." : padForm.keyboardKey}
                      readOnly
                      onClick={() => setRecordingKey(true)}
                      onKeyDown={e => { if (!recordingKey) return; e.preventDefault(); setPadForm(f => ({ ...f, keyboardKey: e.key.length === 1 ? e.key : "" })); setRecordingKey(false); }}
                      onBlur={() => setRecordingKey(false)}
                      placeholder="Clique e pressione"
                      className={cn("cursor-pointer", recordingKey && "border-primary animate-pulse")}
                    />
                    {padForm.keyboardKey && (
                      <button onClick={() => setPadForm(f => ({ ...f, keyboardKey: "" }))} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Volume */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Volume: {Math.round(Number(padForm.volume) * 100)}%</label>
                <input type="range" min={0} max={1} step={0.01} value={padForm.volume}
                  onChange={e => setPadForm(f => ({ ...f, volume: e.target.value }))}
                  className="w-full accent-primary" />
              </div>

              {/* Loop sync */}
              {padForm.type === "LOOP" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={padForm.loopSync}
                    onChange={e => setPadForm(f => ({ ...f, loopSync: e.target.checked }))}
                    className="rounded accent-primary" />
                  <span className="text-sm">Sincronizar com BPM do multitrack</span>
                </label>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={savePad} disabled={saving} className="flex-1">
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar Pad
                </Button>
                <Button variant="outline" onClick={() => setEditingPad(null)}>Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
