"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function EnsaioDetalhePage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userId = (session?.user as any)?.id;
  const canManage = ["SUPERADMIN", "ADMIN", "LEADER"].includes(userRole);

  const [rehearsal, setRehearsal] = useState<any>(null);
  const [justification, setJustification] = useState("");

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

  if (!rehearsal) return <p>Carregando...</p>;

  const pending = rehearsal.attendance?.filter((a: any) => a.status === "PENDING")?.length ?? 0;
  const accepted = rehearsal.attendance?.filter((a: any) => a.status === "ACCEPTED")?.length ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Detalhe do ensaio</h1>

      <Card>
        <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Status: <b>{rehearsal.status}</b></p>
          <p>Local: {rehearsal.location || "Não definido"}</p>
          <p>Tipo: {rehearsal.type}</p>
          <p>Confirmações: {accepted} aceitos / {pending} pendentes</p>
          <p>Observações: {rehearsal.notes || "Sem observações"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Confirmar presença</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Meu status atual: <b>{myAttendance?.status || "PENDING"}</b></p>
          <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Justificativa (opcional)" />
          <div className="flex gap-2">
            <Button onClick={() => respond("ACCEPTED")}>Aceito</Button>
            <Button variant="outline" onClick={() => respond("PENDING")}>Pendente</Button>
            <Button variant="outline" onClick={() => respond("DECLINED")}>Recusar</Button>
          </div>
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
                <span>{item.status}</span>
              </div>
            ))}
            <Button variant="outline">Enviar lembrete (stub)</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
