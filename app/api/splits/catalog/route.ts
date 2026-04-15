export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/splits/catalog
// Retorna splits públicos disponíveis para compra
// Exclui splits que o grupo do usuário já possui
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    // Buscar splits públicos — excluindo os do próprio grupo
    const publicJobs = await (prisma as any).splitJob.findMany({
      where: {
        status: "DONE",
        groupId: { not: user.groupId }, // não mostrar do próprio grupo
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

    // Filtrar apenas os marcados como públicos no metadata
    const catalog = publicJobs.filter((j: any) => j.metadata?.isPublic === true);

    // Verificar quais o grupo atual já possui (comprou)
    // Por ora usamos um campo metadata no job — futuramente tabela SplitAccess
    const ownedJobIds = new Set<string>();

    // Buscar splits que o grupo já tem com mesma música (por nome)
    const ownedSongs = await (prisma as any).splitJob.findMany({
      where: { groupId: user.groupId, status: "DONE" },
      select: { songName: true, artistName: true },
    });
    const ownedSongKeys = new Set(
      ownedSongs.map((s: any) =>
        `${s.songName.toLowerCase().trim()}||${(s.artistName ?? "").toLowerCase().trim()}`
      )
    );

    const catalogWithOwnership = catalog.map((job: any) => {
      const key = `${job.songName.toLowerCase().trim()}||${(job.artistName ?? "").toLowerCase().trim()}`;
      return {
        id:          job.id,
        songName:    job.songName,
        artistName:  job.artistName,
        durationSec: job.durationSec,
        bpm:         job.bpm,
        musicalKey:  job.musicalKey,
        stemsCount:  job.stems.length,
        stems:       job.stems.map((s: any) => s.displayName),
        priceInCents: job.metadata?.priceInCents ?? 490,
        alreadyOwned: ownedSongKeys.has(key), // já tem essa música splitada
        createdAt:   job.createdAt,
      };
    });

    return NextResponse.json({ catalog: catalogWithOwnership });
  } catch (err: any) {
    console.error("[splits/catalog] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/splits/catalog
// Comprar acesso a um split do catálogo (por ora, simulado)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

    // Buscar job original
    const originalJob = await (prisma as any).splitJob.findFirst({
      where: { id: jobId, status: "DONE" },
      include: { stems: true },
    });

    if (!originalJob) return NextResponse.json({ error: "Split não encontrado" }, { status: 404 });
    if (!originalJob.metadata?.isPublic) return NextResponse.json({ error: "Split não disponível" }, { status: 403 });
    if (originalJob.groupId === user.groupId) return NextResponse.json({ error: "Este split já é do seu grupo" }, { status: 400 });

    // Verificar se já tem esse split
    const existing = await (prisma as any).splitJob.findFirst({
      where: {
        groupId: user.groupId,
        songName: originalJob.songName,
        status: "DONE",
      },
    });
    if (existing) return NextResponse.json({ error: "Você já possui um split desta música" }, { status: 409 });

    // Criar cópia do job para o grupo comprador
    // Os stems são os mesmos arquivos R2 (só referência, não duplica arquivo)
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
        metadata:     { purchasedFrom: jobId, priceInCents: originalJob.metadata?.priceInCents ?? 490 },
      },
    });

    // Copiar stems (mesmas chaves R2)
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
