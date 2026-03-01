export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

const db = prisma as any;

const DEFAULT_CHECKLIST = [
  "🎚️ Conferir som",
  "🎹 Conferir teclado",
  "🎸 Afinar instrumentos",
  "🎤 Testar microfones",
];

const isAdminRole = (role?: string) => role === "SUPERADMIN" || role === "ADMIN";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as any;
    const where: any = {};

    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) {
        return NextResponse.json({ error: "Sem grupo selecionado" }, { status: 403 });
      }
      where.groupId = user.groupId;
    }

    const status = req.nextUrl.searchParams.get("status");
    if (status) where.status = status;

    if (!db?.rehearsal?.findMany) {
      console.error("Get rehearsals error: Prisma delegate 'rehearsal' is not available");
      return NextResponse.json([]);
    }

    const rehearsals = await db.rehearsal.findMany({
      where,
      include: {
        songs: { orderBy: { order: "asc" } },
        attendance: { include: { member: true } },
        checklist: true,
      },
      orderBy: { dateTime: "asc" },
      take: 50,
    });

    return NextResponse.json(rehearsals);
  } catch (error) {
    console.error("Get rehearsals error:", error);
    return NextResponse.json({ error: "Erro ao buscar ensaios" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const canCreate =
      isAdminRole(user.role) ||
      hasPermission(user.role, "rehearsal.create", user.permissions) ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    if (!canCreate) {
      return NextResponse.json({ error: "Sem permissão para criar ensaio" }, { status: 403 });
    }

    if (user.role !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Sem grupo selecionado" }, { status: 403 });
    }

    if (!db?.rehearsal?.create) {
      return NextResponse.json({ error: "Módulo de ensaios indisponível no momento" }, { status: 503 });
    }

    const body = await req.json();
    const {
      date,
      time,
      location,
      notes,
      type,
      status,
      estimatedMinutes,
      songs = [],
      checklist,
    } = body ?? {};

    const isPublishing = status === "PUBLISHED";
    const canPublish =
      isAdminRole(user.role) ||
      hasPermission(user.role, "rehearsal.publish", user.permissions) ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    if (isPublishing && !canPublish) {
      return NextResponse.json({ error: "Sem permissão para publicar ensaio" }, { status: 403 });
    }

    if (!date) return NextResponse.json({ error: "Data é obrigatória" }, { status: 400 });

    const dateTime = new Date(`${date}T${time || "19:30"}:00`);

    const created = await db.rehearsal.create({
      data: {
        groupId: user.groupId ?? null,
        dateTime,
        location: location ?? null,
        notes: notes ?? null,
        type: type ?? "GENERAL",
        status: status ?? "DRAFT",
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        songs: {
          create: (songs ?? []).map((song: any, index: number) => ({
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
            status: song.songId ? "REHEARSED" : "REHEARSAL_ONLY",
          })),
        },
        checklist: {
          create: (checklist?.length ? checklist : DEFAULT_CHECKLIST).map((label: string) => ({ label })),
        },
      },
      include: {
        songs: { orderBy: { order: "asc" } },
        attendance: true,
        checklist: true,
      },
    });

    const members = await db.user.findMany({
      where: { groupId: user.groupId ?? undefined },
      select: { id: true },
    });

    if (members.length > 0) {
      await db.rehearsalAttendance.createMany({
        data: members.map((member) => ({
          rehearsalId: created.id,
          memberId: member.id,
          status: "PENDING",
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      ...created,
      notificationStub:
        created.status === "PUBLISHED"
          ? "TODO: disparar notificação por email ao publicar ensaio"
          : null,
    });
  } catch (error) {
    console.error("Create rehearsal error:", error);
    return NextResponse.json({ error: "Erro ao criar ensaio" }, { status: 500 });
  }
}
