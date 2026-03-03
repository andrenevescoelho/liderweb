"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Music2, CalendarClock, AlertTriangle, Clock3, Plus, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/authorization";

const pad = (value: number) => String(value).padStart(2, "0");

const formatUtcDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} às ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

const statusMeta: Record<string, { badge: string; icon: string; classes: string }> = {
  PUBLISHED: { badge: "Disponível", icon: "📢", classes: "bg-blue-100 text-blue-800" },
  ACCEPTED: { badge: "Confirmado", icon: "✅", classes: "bg-green-100 text-green-800" },
  REJECTED: { badge: "Indisponível", icon: "⚠️", classes: "bg-red-100 text-red-800" },
  DECLINED: { badge: "Indisponível", icon: "⚠️", classes: "bg-red-100 text-red-800" },
  PENDING: { badge: "Aguardando", icon: "🕒", classes: "bg-amber-100 text-amber-800" },
  DRAFT: { badge: "Rascunho", icon: "📝", classes: "bg-slate-100 text-slate-700" },
};

const renderStatusBadge = (status?: string) => {
  const meta = statusMeta[status ?? ""];

  if (!meta) {
    return <Badge>{status ?? "-"}</Badge>;
  }

  return (
    <Badge className={`inline-flex items-center gap-1 ${meta.classes}`}>
      <span>{meta.icon}</span>
      <span>{meta.badge}</span>
    </Badge>
  );
};

export default function EnsaiosPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];
  const canManage =
    userRole === "SUPERADMIN" ||
    userRole === "ADMIN" ||
    hasPermission(userRole, "rehearsal.manage", userPermissions);
  const canCreate = canManage;
  const canSendReminder = canManage;

  const [rehearsals, setRehearsals] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/rehearsals")
      .then((res) => res.json())
      .then((data) => setRehearsals(Array.isArray(data) ? data : []))
      .catch(() => setRehearsals([]));
  }, []);

  const nextRehearsal = useMemo(() => {
    const now = new Date();
    return [...rehearsals]
      .filter((item) => new Date(item.dateTime) >= now)
      .sort((a, b) => +new Date(a.dateTime) - +new Date(b.dateTime))[0];
  }, [rehearsals]);

  const attendanceStats = useMemo(() => {
    const attendance = nextRehearsal?.attendance ?? [];
    const accepted = attendance.filter((a: any) => a.status === "ACCEPTED").length;
    const declined = attendance.filter((a: any) => a.status === "DECLINED").length;
    const pending = attendance.filter((a: any) => a.status === "PENDING").length;
    const total = attendance.length || 1;
    return {
      accepted,
      declined,
      pending,
      confirmationRate: Math.round((accepted / total) * 100),
    };
  }, [nextRehearsal]);

  const songTotalMinutes = useMemo(() => {
    if (Number(nextRehearsal?.estimatedMinutes) > 0) {
      return Number(nextRehearsal.estimatedMinutes);
    }

    const songs = nextRehearsal?.songs ?? [];
    const withBpm = songs.filter((song: any) => Number(song.bpm) > 0);
    if (withBpm.length === 0) return nextRehearsal?.estimatedMinutes ?? 0;
    return withBpm.length * 5;
  }, [nextRehearsal]);

  const pendingItems = useMemo(() => {
    const songs = nextRehearsal?.songs ?? [];
    const newSongs = songs.filter((song: any) => song.status === "REHEARSAL_ONLY").length;
    const missingMedia = songs.filter((song: any) => !song.songId).length;
    const pendingMembers = attendanceStats.pending;
    return { newSongs, missingMedia, pendingMembers };
  }, [nextRehearsal, attendanceStats.pending]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ensaios</h1>
          <p className="text-muted-foreground">Planejamento, repertório e confirmações em um só lugar.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/ensaios/calendario">
            <Button variant="outline">Calendário</Button>
          </Link>
          {canCreate && (
            <Link href="/ensaios/novo">
              <Button><Plus className="w-4 h-4 mr-2" /> Criar ensaio</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" /> Próximo ensaio</CardTitle></CardHeader>
          <CardContent>
            {!nextRehearsal ? (
              <p className="text-muted-foreground">Nenhum ensaio agendado.</p>
            ) : (
              <div className="space-y-2">
                <p className="font-medium">{formatUtcDateTime(nextRehearsal.dateTime)}</p>
                <p className="text-sm text-muted-foreground">Local: {nextRehearsal.location || "Não definido"}</p>
                {renderStatusBadge(nextRehearsal.status)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Music2 className="w-5 h-5 text-primary" /> Repertório do próximo ensaio</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(nextRehearsal?.songs ?? []).slice(0, 5).map((song: any) => (
                <li key={song.id} className="rounded-lg border border-border/70 bg-muted/20 p-2 text-sm text-foreground">
                  {song.title} {song.artist ? `- ${song.artist}` : ""}
                </li>
              ))}
            </ul>
            {(nextRehearsal?.songs?.length ?? 0) > 5 && (
              <p className="text-xs text-muted-foreground mt-2">+{nextRehearsal.songs.length - 5} músicas</p>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader><CardTitle>Presença confirmada</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Aceitos: {attendanceStats.accepted}</p>
              <p>Pendentes: {attendanceStats.pending}</p>
              <p>Recusados: {attendanceStats.declined}</p>
              <p className="font-semibold">Taxa de confirmação: {attendanceStats.confirmationRate}%</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="w-5 h-5 text-primary" /> Tempo estimado</CardTitle></CardHeader>
          <CardContent>
            <p className="font-semibold text-lg">{songTotalMinutes || 0} min</p>
            <p className="text-xs text-muted-foreground">Baseado na quantidade de músicas (ou valor estimado manual).</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Pendências</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">Músicas novas: <b>{pendingItems.newSongs}</b></div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">Sem resposta: <b>{pendingItems.pendingMembers}</b></div>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">Sem cifra/multitrack: <b>{pendingItems.missingMedia}</b></div>
        </CardContent>
      </Card>

      {(canCreate || canSendReminder) && (
        <Card>
          <CardHeader><CardTitle>Ações rápidas</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {canCreate && <Link href="/ensaios/novo"><Button><Plus className="w-4 h-4 mr-2" /> Criar ensaio</Button></Link>}
            <Button variant="outline">Importar repertório de escala</Button>
            {canSendReminder && <Button variant="outline"><BellRing className="w-4 h-4 mr-2" /> Enviar lembrete</Button>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
