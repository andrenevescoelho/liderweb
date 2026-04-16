export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const publicJobs = await (prisma as any).splitJob.findMany({
      where: {
        isPublic: true,
        status: "DONE",
        groupId: { not: user.groupId },
        purchasedFrom: null, // não mostrar cópias compradas, só originais
        ...(search ? {
          OR: [
            { songName:   { contains: search, mode: "insensitive" } },
            { artistName: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: {
        stems: { select: { id: true, label: true, displayName: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Músicas que o grupo já possui (para marcar como "já tem")
    const ownedSongs = await (prisma as any).splitJob.findMany({
      where: { groupId: user.groupId, status: "DONE" },
      select: { songName: true, artistName: true },
    });
    const ownedKeys = new Set(
      ownedSongs.map((s: any) =>
        `${s.songName.toLowerCase().trim()}||${(s.artistName ?? "").toLowerCase().trim()}`
      )
    );

    const catalog = publicJobs.map((job: any) => {
      const key = `${job.songName.toLowerCase().trim()}||${(job.artistName ?? "").toLowerCase().trim()}`;
      return {
        id:           job.id,
        songName:     job.songName,
        artistName:   job.artistName,
        durationSec:  job.durationSec,
        bpm:          job.bpm,
        musicalKey:   job.musicalKey,
        stemsCount:   job.stems.length,
        stems:        job.stems.map((s: any) => s.displayName),
        priceInCents: job.priceInCents ?? 490,
        alreadyOwned: ownedKeys.has(key),
        createdAt:    job.createdAt,
      };
    });

    return NextResponse.json({ catalog });
  } catch (err: any) {
    console.error("[splits/catalog] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

    const originalJob = await (prisma as any).splitJob.findFirst({
      where: { id: jobId, status: "DONE", isPublic: true },
      include: { stems: true },
    });

    if (!originalJob) return NextResponse.json({ error: "Split não encontrado" }, { status: 404 });
    if (originalJob.groupId === user.groupId) {
      return NextResponse.json({ error: "Este split já é do seu grupo" }, { status: 400 });
    }

    const existing = await (prisma as any).splitJob.findFirst({
      where: { groupId: user.groupId, songName: originalJob.songName, status: "DONE" },
    });
    if (existing) {
      return NextResponse.json({ error: "Você já possui um split desta música" }, { status: 409 });
    }

    // Criar cópia para o grupo comprador (reutiliza chaves R2, não duplica arquivos)
    const newJob = await (prisma as any).splitJob.create({
      data: {
        groupId:      user.groupId,
        userId:       user.id,
        songName:     originalJob.songName,
        artistName:   originalJob.artistName,
        status:       "DONE",
        sourceFileKey: originalJob.sourceFileKey,
        fileName:     originalJob.fileName,
        fileSizeBytes: originalJob.fileSizeBytes,
        durationSec:  originalJob.durationSec,
        bpm:          originalJob.bpm,
        musicalKey:   originalJob.musicalKey,
        sections:     originalJob.sections,
        isPublic:     false,
        purchasedFrom: jobId,
        priceInCents: originalJob.priceInCents ?? 490,
      },
    });

    await (prisma as any).splitStem.createMany({
      data: originalJob.stems.map((s: any) => ({
        jobId:       newJob.id,
        label:       s.label,
        displayName: s.displayName,
        fileKey:     s.fileKey,
        type:        s.type,
        durationSec: s.durationSec,
      })),
    });

    return NextResponse.json({ ok: true, jobId: newJob.id });
  } catch (err: any) {
    console.error("[splits/catalog] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
