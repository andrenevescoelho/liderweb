"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { hasPermission } from "@/lib/authorization";
import { Youtube, Headphones, Radio, Layers, Music } from "lucide-react";

export default function EnsaioDetalhePage() {
  const statusMeta: Record<string, { label: string; badge: string; icon: string; classes: string }> = {
    PUBLISHED: { label: "Escala disponível", badge: "Disponível", icon: "📢", classes: "bg-blue-100 text-blue-800" },
    ACCEPTED: { label: "Presença confirmada", badge: "Confirmado", icon: "✅", classes: "bg-green-100 text-green-800" },
    REJECTED: { label: "Sem disponibilidade", badge: "Indisponível", icon: "⚠️", classes: "bg-red-100 text-red-800" },
    DECLINED: { label: "Sem disponibilidade", badge: "Indisponível", icon: "⚠️", classes: "bg-red-100 text-red-800" },
    PENDING: { label: "Aguardando resposta", badge: "Aguardando", icon: "🕒", classes: "bg-amber-100 text-amber-800" },
    DRAFT: { label: "Em preparação", badge: "Rascunho", icon: "📝", classes: "bg-slate-100 text-slate-700" },
  };

  const renderStatusBadge = (status?: string) => {
    const meta = statusMeta[status ?? ""];
    if (!meta) return status || "-";

    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.classes}`}>
        <span>{meta.icon}</span>
        <span>{meta.badge}</span>
      </span>
    );
  };

  const getStatusLabel = (status?: string) => statusMeta[status ?? ""]?.label ?? status ?? "-";

  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const userId = (session?.user as any)?.id;
  const isAdmin = userRole === "SUPERADMIN" || userRole === "ADMIN";
  const canEdit =
    isAdmin || hasPermission(userRole, "rehearsal.manage", userPermissions) || hasPermission(userRole, "rehearsal.edit", userPermissions);
  const canDelete =
    isAdmin || hasPermission(userRole, "rehearsal.manage", userPermissions) || hasPermission(userRole, "rehearsal.delete", userPermissions);
  const canPublish =
    isAdmin || hasPermission(userRole, "rehearsal.manage", userPermissions) || hasPermission(userRole, "rehearsal.publish", userPermissions);
  const canManage = canEdit || canDelete || canPublish;

  const [rehearsal, setRehearsal] = useState<any>(null);
  const [justification, setJustification] = useState("");
  const [loadingAction, setLoadingAction] = useState<"publish" | "delete" | null>(null);

  const load = async () => {
    const res = await fetch(`/api/rehearsals/${params.id}`);
    const data = await res.json();
    setRehearsal(data);
  };

  useEffect(() => {
    if (params.id) load();
  }, [params.id]);

  const myAttendance = useMemo(
    () => (rehearsal?.attendance ?? []).find((item: any) => item.memberId === userId),
    [rehearsal, userId]
  );

  const respond = async (status: string) => {
    await fetch(`/api/rehearsals/${params.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, justification }),
    });
    load();
  };

  const promoteSong = async (rehearsalSongId: string) => {
    await fetch(`/api/rehearsals/${params.id}/promote-song`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rehearsalSongId }),
    });
    load();
  };

  const togglePublish = async () => {
    if (!rehearsal?.id || !canPublish) return;

    setLoadingAction("publish");
    try {
      const nextStatus = rehearsal.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      const res = await fetch(`/api/rehearsals/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        toast({
          title: "Não foi possível atualizar o status",
          description: "Verifique suas permissões e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: nextStatus === "PUBLISHED" ? "Ensaio publicado" : "Ensaio despublicado",
      });
      load();
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao atualizar ensaio",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const deleteRehearsal = async () => {
    if (!rehearsal?.id) return;

    setLoadingAction("delete");
    try {
      const res = await fetch(`/api/rehearsals/${params.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast({
          title: "Não foi possível excluir",
          description: "Verifique suas permissões e tente novamente.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Ensaio excluído com sucesso" });
      router.push("/ensaios");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast({
        title: "Erro ao excluir ensaio",
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  if (!rehearsal) return <p>Carregando...</p>;

  const pending = rehearsal.attendance?.filter((a: any) => a.status === "PENDING")?.length ?? 0;
  const accepted = rehearsal.attendance?.filter((a: any) => a.status === "ACCEPTED")?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Detalhe do ensaio</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {canPublish && (
              <Button variant="outline" onClick={togglePublish} disabled={loadingAction === "publish"}>
                {rehearsal.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => router.push(`/ensaios/novo?rehearsalId=${rehearsal.id}`)}>
                Editar ensaio
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={loadingAction === "delete"}>Excluir ensaio</Button>
                </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza que deseja excluir este ensaio?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Essa ação é irreversível e removerá o ensaio permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteRehearsal}>Excluir ensaio</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Status do ensaio: {renderStatusBadge(rehearsal.status)}</p>
          <p>Local: {rehearsal.location || "Não definido"}</p>
          <p>Tipo: {rehearsal.type}</p>
          <p>Confirmações: {accepted} aceitos / {pending} pendentes</p>
          <p>Observações: {rehearsal.notes || "Sem observações"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{myAttendance?.status === "ACCEPTED" ? "Presença" : "Confirmar presença"}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Meu status atual: {renderStatusBadge(myAttendance?.status || "PENDING")}</p>
          {myAttendance?.status !== "ACCEPTED" && (
            <>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Justificativa (opcional)" />
              <div className="flex gap-2">
                <Button onClick={() => respond("ACCEPTED")}>Aceito</Button>
                <Button variant="outline" onClick={() => respond("PENDING")}>Pendente</Button>
                <Button variant="outline" onClick={() => respond("DECLINED")}>Recusar</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle>Repertório (lista vertical)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(rehearsal.songs ?? []).map((song: any) => {
            const res = song.resources ?? {};
            return (
            <div key={song.id} className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{song.title} {song.artist ? `- ${song.artist}` : ""}</p>
                  <p className="text-xs text-muted-foreground">Tom: {song.key || "-"} | BPM: {song.bpm || "-"}</p>
                </div>
                {/* Botão de ação primária */}
                <div className="flex-shrink-0">
                  {res.multitrack && res.multitrackRented && res.multitrackAlbumId ? (
                    <a href={`/multitracks/${res.multitrackAlbumId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors">
                      <Headphones className="h-3 w-3" /> Multitrack
                    </a>
                  ) : res.youtube && res.youtubeUrl ? (
                    <a href={res.youtubeUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors">
                      <Youtube className="h-3 w-3" /> YouTube
                    </a>
                  ) : res.audio && res.audioUrl ? (
                    <a href={res.audioUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                      <Radio className="h-3 w-3" /> Áudio
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Indicadores de recursos */}
              <div className="flex flex-wrap gap-1">
                {res.cifra && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                    <Music className="h-2.5 w-2.5" /> Cifra
                  </span>
                )}
                {res.youtube && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400">
                    <Youtube className="h-2.5 w-2.5" /> YouTube
                  </span>
                )}
                {res.audio && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400">
                    <Radio className="h-2.5 w-2.5" /> Áudio
                  </span>
                )}
                {res.multitrack && (
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                    res.multitrackRented
                      ? "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-400"
                      : "bg-muted/50 text-muted-foreground border-border/50"
                  }`}>
                    <Headphones className="h-2.5 w-2.5" />
                    {res.multitrackRented ? "Multitrack" : "Multitrack (não alugado)"}
                  </span>
                )}
                {res.pad && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400">
                    <Layers className="h-2.5 w-2.5" /> Pad
                  </span>
                )}
              </div>

              {song.notes && <p className="text-sm">{song.notes}</p>}
              <div className="text-xs text-muted-foreground">Anexos: {(song.song?.attachments?.length ?? 0) > 0 ? `${song.song.attachments.length} arquivo(s)` : "Sem anexos"}</div>
              {(song.tasks ?? []).length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">Minha tarefa</p>
                  {(song.tasks ?? []).map((task: any) => (
                    <p key={task.id}>🎹 {task.member?.name} - {task.notes}</p>
                  ))}
                </div>
              )}
              {canManage && song.status !== "PROMOTED" && (
                <Button size="sm" variant="outline" onClick={() => promoteSong(song.id)}>Promover para repertório</Button>
              )}
            </div>
            );
          })}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader><CardTitle>Confirmações (admin)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(rehearsal.attendance ?? []).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-2">
                <span>{item.member?.name}</span>
                {renderStatusBadge(item.status)}
              </div>
            ))}
            <Button variant="outline">Enviar lembrete (stub)</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
