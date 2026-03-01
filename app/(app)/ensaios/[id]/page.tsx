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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Detalhe do ensaio</h1>
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
          {(rehearsal.songs ?? []).map((song: any) => (
            <div key={song.id} className="border rounded p-3 space-y-1">
              <p className="font-medium">{song.title} {song.artist ? `- ${song.artist}` : ""}</p>
              <p className="text-xs text-gray-500">Tom: {song.key || "-"} | BPM: {song.bpm || "-"} | Tags: {(song.tags || []).join(", ") || "-"}</p>
              {song.notes && <p className="text-sm">{song.notes}</p>}
              {song.youtubeUrl && (
                <a className="text-xs text-blue-600 underline" href={song.youtubeUrl} target="_blank" rel="noreferrer">YouTube</a>
              )}
              {song.audioUrl && (
                <audio controls className="w-full h-10">
                  <source src={song.audioUrl} />
                </audio>
              )}
              <div className="text-xs text-gray-500">Arquivos: {(song.song?.attachments?.length ?? 0) > 0 ? `${song.song.attachments.length} anexos` : "Sem anexos"}</div>
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
          ))}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader><CardTitle>Confirmações (admin)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(rehearsal.attendance ?? []).map((item: any) => (
              <div key={item.id} className="border rounded p-2 flex items-center justify-between">
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
