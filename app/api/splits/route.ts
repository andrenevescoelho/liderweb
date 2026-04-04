export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { canAccessFeature, getQuota } from "@/lib/billing/entitlements";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";

// GET — listar jobs do grupo
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("id");

    if (jobId) {
      const job = await (prisma as any).splitJob.findFirst({
        where: { id: jobId, groupId: user.groupId },
        include: { stems: { orderBy: { label: "asc" } } },
      });
      if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
      return NextResponse.json({ job });
    }

    const jobs = await (prisma as any).splitJob.findMany({
      where: { groupId: user.groupId },
      include: { stems: { select: { id: true, label: true, displayName: true, type: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const hasAccess = await canAccessFeature(user.groupId, "splits");
    const quota = hasAccess ? await getQuota(user.groupId, "splits") : 0;

    // Contar uso mensal
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usedThisMonth = await (prisma as any).splitJob.count({
      where: {
        groupId: user.groupId,
        status: { in: ["DONE", "PROCESSING", "ANALYZING", "GENERATING"] },
        createdAt: { gte: startOfMonth },
      },
    });

    return NextResponse.json({ jobs, quota, usedThisMonth, hasAccess });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — criar novo job de split (upload do arquivo)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const hasAccess = await canAccessFeature(user.groupId, "splits");
    if (!hasAccess) {
      return NextResponse.json({
        error: "UPGRADE_REQUIRED",
        message: "Split de músicas está disponível nos planos Avançado e Igreja.",
      }, { status: 402 });
    }

    // Verificar cota mensal
    const quota = await getQuota(user.groupId, "splits");
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usedThisMonth = await (prisma as any).splitJob.count({
      where: {
        groupId: user.groupId,
        status: { in: ["DONE", "PROCESSING", "ANALYZING", "GENERATING"] },
        createdAt: { gte: startOfMonth },
      },
    });

    if (usedThisMonth >= quota) {
      return NextResponse.json({
        error: "QUOTA_EXCEEDED",
        message: `Cota mensal de ${quota} splits atingida.`,
        usage: { used: usedThisMonth, quota },
      }, { status: 402 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const songName = formData.get("songName") as string ?? "Música";
    const artistName = formData.get("artistName") as string ?? "";
    const songId = formData.get("songId") as string ?? null;
    const stemsParam = formData.get("stems") as string ?? "vocals,drum,bass,piano";
    const selectedStems = stemsParam.split(",").filter(Boolean);

    if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });

    // Validar formato
    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/flac", "audio/ogg"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|flac|ogg|aac)$/i)) {
      return NextResponse.json({ error: "Formato inválido. Use MP3, WAV, M4A, FLAC ou OGG." }, { status: 400 });
    }

    // Limite de 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo muito grande. Limite: 50MB." }, { status: 400 });
    }

    // Salvar arquivo original no R2
    const s3Client = createS3Client();
    const { bucketName, folderPrefix } = getBucketConfig();
    const ext = file.name.split(".").pop() ?? "mp3";
    const fileKey = `${folderPrefix}splits/${user.groupId}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;

    const arrayBuffer = await file.arrayBuffer();
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: Buffer.from(arrayBuffer),
      ContentType: file.type || "audio/mpeg",
    }));

    // Criar job no banco
    const job = await (prisma as any).splitJob.create({
      data: {
        groupId: user.groupId,
        userId: user.id,
        songId: songId || null,
        songName: songName.trim(),
        artistName: artistName.trim() || null,
        status: "PENDING",
        sourceFileKey: fileKey,
        fileName: file.name,
        fileSizeBytes: file.size,
        sections: selectedStems, // reusing sections field temporarily to pass stems
      },
    });

    // Disparar processamento assíncrono (não aguardar)
    // Usar localhost para evitar timeout de conexão externa dentro do container
    const internalUrl = "http://localhost:3000";
    fetch(`${internalUrl}/api/splits/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": process.env.NEXTAUTH_SECRET ?? "" },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(err => console.error("[splits] dispatch error:", err));

    return NextResponse.json({ job }, { status: 201 });
  } catch (error: any) {
    console.error("[splits/POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — cancelar job em andamento
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const jobId = req.nextUrl.searchParams.get("id");
    if (!jobId) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const job = await (prisma as any).splitJob.findFirst({
      where: { id: jobId, groupId: user.groupId },
    });

    if (!job) return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") ?? "cancel";

    if (action === "delete") {
      // Hard delete — remove job e stems do banco
      await (prisma as any).splitStem.deleteMany({ where: { jobId } });
      await (prisma as any).splitJob.delete({ where: { id: jobId } });
      return NextResponse.json({ success: true });
    }

    // Cancel — só marca como FAILED
    const cancellable = ["PENDING", "UPLOADING", "PROCESSING", "ANALYZING", "GENERATING"];
    if (!cancellable.includes(job.status)) {
      return NextResponse.json({ error: "Job não pode ser cancelado neste estado" }, { status: 400 });
    }

    if (job.lalalTaskId) {
      const taskIds = job.lalalTaskId.split(",");
      fetch("https://www.lalal.ai/api/v1/cancel/", {
        method: "POST",
        headers: { "X-License-Key": process.env.LALAL_API_KEY ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: taskIds }),
      }).catch(() => {});
    }

    await (prisma as any).splitJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: "Cancelado pelo usuário" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
