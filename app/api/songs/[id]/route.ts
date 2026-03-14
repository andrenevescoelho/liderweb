export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

function sanitizeChordUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const song = await prisma.song.findUnique({
      where: { id: params?.id },
      include: { attachments: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Música não encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      ...song,
      bpmEffective: song.bpmUserOverride ?? song.bpmDetected ?? song.bpm,
      keyEffective: song.keyUserOverride ?? song.keyDetected ?? song.originalKey,
    });
  } catch (error) {
    console.error("Get song error:", error);
    return NextResponse.json({ error: "Erro ao buscar música" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const context = extractRequestContext(req);

    const before = await prisma.song.findUnique({ where: { id: params?.id } });
    if (!before) {
      return NextResponse.json({ error: "Música não encontrada" }, { status: 404 });
    }
    const { title, artist, bpm, originalKey, timeSignature, tags, lyrics, chordPro, chordUrl, audioUrl, youtubeUrl } = body ?? {};

    const parsedBpm = bpm ? parseInt(bpm) : null;
    const sanitizedChordUrl = sanitizeChordUrl(chordUrl);

    if (chordUrl && !sanitizedChordUrl) {
      return NextResponse.json({ error: "Link da cifra inválido. Use URL com http:// ou https://" }, { status: 400 });
    }

    const song = await prisma.song.update({
      where: { id: params?.id },
      data: {
        title,
        artist: artist ?? null,
        bpm: parsedBpm,
        originalKey,
        timeSignature: timeSignature ?? "4/4",
        tags: tags ?? [],
        lyrics: lyrics ?? null,
        chordPro: chordPro ?? null,
        chordUrl: sanitizedChordUrl,
        audioUrl: audioUrl ?? null,
        youtubeUrl: youtubeUrl ?? null,
        bpmUserOverride: parsedBpm,
        keyUserOverride: originalKey ?? null,
      },
    });

    await logUserAction({
      userId: (session?.user as any)?.id,
      groupId: song.groupId ?? (session?.user as any)?.groupId ?? null,
      action: AUDIT_ACTIONS.SONG_UPDATED,
      entityType: AuditEntityType.SONG,
      entityId: song.id,
      entityName: song.title,
      description: `Música ${song.title} foi atualizada`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { title: before.title, artist: before.artist, bpm: before.bpm, originalKey: before.originalKey },
      newValues: { title: song.title, artist: song.artist, bpm: song.bpm, originalKey: song.originalKey },
    });

    return NextResponse.json(song);
  } catch (error) {
    console.error("Update song error:", error);
    return NextResponse.json({ error: "Erro ao atualizar música" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const context = extractRequestContext(req);
    const before = await prisma.song.findUnique({ where: { id: params?.id } });
    if (!before) {
      return NextResponse.json({ error: "Música não encontrada" }, { status: 404 });
    }

    await prisma.song.delete({
      where: { id: params?.id },
    });

    await logUserAction({
      userId: (session?.user as any)?.id,
      groupId: before.groupId ?? (session?.user as any)?.groupId ?? null,
      action: AUDIT_ACTIONS.SONG_DELETED,
      entityType: AuditEntityType.SONG,
      entityId: before.id,
      entityName: before.title,
      description: `Música ${before.title} foi excluída`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: { title: before.title, artist: before.artist, bpm: before.bpm, originalKey: before.originalKey },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete song error:", error);
    return NextResponse.json({ error: "Erro ao excluir música" }, { status: 500 });
  }
}
