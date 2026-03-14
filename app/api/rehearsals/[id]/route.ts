export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

const db = prisma as any;
const isAdminRole = (role?: string) => role === "SUPERADMIN" || role === "ADMIN";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    if (!db?.rehearsal?.findUnique) {
      console.error("Get rehearsal error: Prisma delegate 'rehearsal' is not available");
      return NextResponse.json({ error: "Módulo de ensaios indisponível no momento" }, { status: 503 });
    }

    const rehearsal = await db.rehearsal.findUnique({
      where: { id: params.id },
      include: {
        songs: {
          orderBy: { order: "asc" },
          include: { song: { include: { attachments: true } }, tasks: { include: { member: true } } },
        },
        attendance: { include: { member: true } },
        checklist: true,
      },
    });

    if (!rehearsal) return NextResponse.json({ error: "Ensaio não encontrado" }, { status: 404 });

    if (user.role !== "SUPERADMIN" && rehearsal.groupId !== user.groupId) {
      return NextResponse.json({ error: "Sem permissão para visualizar ensaio" }, { status: 403 });
    }

    return NextResponse.json(rehearsal);
  } catch (error) {
    console.error("Get rehearsal error:", error);
    return NextResponse.json({ error: "Erro ao buscar ensaio" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const canEdit =
      isAdminRole(user.role) ||
      hasPermission(user.role, "rehearsal.edit", user.permissions) ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    if (!canEdit) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const body = await req.json();
    const context = extractRequestContext(req);
    const { date, time, location, notes, type, status, estimatedMinutes, songs, checklist } = body ?? {};

    const isPublishing = status === "PUBLISHED";
    const canPublish =
      isAdminRole(user.role) ||
      hasPermission(user.role, "rehearsal.publish", user.permissions) ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    if (isPublishing && !canPublish) {
      return NextResponse.json({ error: "Sem permissão para publicar ensaio" }, { status: 403 });
    }

    if (!db?.rehearsal?.update || !db?.rehearsalSong?.deleteMany || !db?.rehearsalChecklistItem?.deleteMany) {
      return NextResponse.json({ error: "Módulo de ensaios indisponível no momento" }, { status: 503 });
    }

    const current = await db.rehearsal.findUnique({ where: { id: params.id }, select: { id: true, groupId: true, dateTime: true, status: true, location: true } });
    if (!current) return NextResponse.json({ error: "Ensaio não encontrado" }, { status: 404 });

    if (user.role !== "SUPERADMIN" && current.groupId !== user.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    if (Array.isArray(songs)) {
      await db.rehearsalSong.deleteMany({ where: { rehearsalId: params.id } });
    }

    if (Array.isArray(checklist)) {
      await db.rehearsalChecklistItem.deleteMany({ where: { rehearsalId: params.id } });
    }

    const updated = await db.rehearsal.update({
      where: { id: params.id },
      data: {
        dateTime: date ? new Date(`${date}T${time || "19:30"}:00`) : undefined,
        location,
        notes,
        type,
        status,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        songs: Array.isArray(songs)
          ? {
              create: songs.map((song: any, index: number) => ({
                songId: song.songId || null,
                title: song.title,
                artist: song.artist || null,
                order: index,
                key: song.key || null,
                bpm: song.bpm ? Number(song.bpm) : null,
                partNotes: song.partNotes || null,
                notes: song.notes || null,
                audioUrl: song.audioUrl || null,
                youtubeUrl: song.youtubeUrl || null,
                tags: song.tags || [],
                status: song.status || (song.songId ? "REHEARSED" : "REHEARSAL_ONLY"),
              })),
            }
          : undefined,
        checklist: Array.isArray(checklist)
          ? { create: checklist.map((item: any) => ({ label: item.label || item, done: Boolean(item.done) })) }
          : undefined,
      },
      include: {
        songs: { orderBy: { order: "asc" } },
        attendance: { include: { member: true } },
        checklist: true,
      },
    });

    await logUserAction({
      userId: user.id,
      groupId: updated.groupId ?? user.groupId ?? null,
      action: AUDIT_ACTIONS.REHEARSAL_UPDATED,
      entityType: AuditEntityType.REHEARSAL,
      entityId: updated.id,
      entityName: `Ensaio ${updated.dateTime.toISOString()}`,
      description: `Usuário ${user.name} atualizou um ensaio`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { dateTime: current.dateTime, status: current.status, location: current.location },
      newValues: { dateTime: updated.dateTime, status: updated.status, location: updated.location },
      metadata: { songsCount: updated.songs.length, checklistCount: updated.checklist.length },
    });

    return NextResponse.json({
      ...updated,
      notificationStub: status === "PUBLISHED" ? "TODO: notificar membros por email" : null,
    });
  } catch (error) {
    console.error("Patch rehearsal error:", error);
    return NextResponse.json({ error: "Erro ao atualizar ensaio" }, { status: 500 });
  }
}


export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const canDelete =
      isAdminRole(user.role) ||
      hasPermission(user.role, "rehearsal.delete", user.permissions) ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    if (!canDelete) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    if (!db?.rehearsal?.delete) {
      return NextResponse.json({ error: "Módulo de ensaios indisponível no momento" }, { status: 503 });
    }

    const current = await db.rehearsal.findUnique({ where: { id: params.id }, select: { id: true, groupId: true, dateTime: true, status: true, location: true } });
    if (!current) return NextResponse.json({ error: "Ensaio não encontrado" }, { status: 404 });

    if (user.role !== "SUPERADMIN" && current.groupId !== user.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const context = extractRequestContext(req);

    await db.rehearsal.delete({ where: { id: params.id } });

    await logUserAction({
      userId: user.id,
      groupId: current.groupId ?? user.groupId ?? null,
      action: AUDIT_ACTIONS.REHEARSAL_DELETED,
      entityType: AuditEntityType.REHEARSAL,
      entityId: current.id,
      entityName: `Ensaio ${current.dateTime.toISOString()}`,
      description: `Usuário ${user.name} removeu um ensaio`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { dateTime: current.dateTime, status: current.status, location: current.location },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete rehearsal error:", error);
    return NextResponse.json({ error: "Erro ao excluir ensaio" }, { status: 500 });
  }
}
