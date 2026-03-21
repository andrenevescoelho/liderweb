export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { S3Client, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";

const PLAN_LIMITS: Record<string, number> = {
  starter: 0,
  pro: 3,
  advanced: 5,
  enterprise: 10,
};

async function copyDriveFileToR2(
  driveUrl: string,
  r2Key: string,
  s3Client: S3Client,
  bucketName: string
): Promise<boolean> {
  try {
    // Download do Google Drive
    const response = await fetch(driveUrl);
    if (!response.ok) {
      console.error(`[multitracks/rent] Failed to download from Drive: ${response.status}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
      Body: Buffer.from(buffer),
      ContentType: response.headers.get("content-type") || "audio/mpeg",
    }));

    return true;
  } catch (err) {
    console.error(`[multitracks/rent] Error copying to R2:`, err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });
    if (!["ADMIN", "SUPERADMIN", "LEADER"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatório" }, { status: 400 });

    // Verificar se já alugou
    const existing = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
    });
    if (existing?.status === "ACTIVE" && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "Multitrack já alugada e ativa" }, { status: 409 });
    }

    // Verificar cota do mês
    const now = new Date();
    const usageRecord = await prisma.multitracksUsage.findUnique({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    const currentCount = usageRecord?.count ?? 0;

    // Buscar plano do grupo
    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: { plan: true },
    });
    const planFeatures = subscription?.plan?.features ?? [];
    const multitrackLimit = planFeatures
      .map((f) => f.match(/multitracks:(\d+)/)?.[1])
      .filter(Boolean)
      .map(Number)[0] ?? 0;

    if (multitrackLimit === 0) {
      return NextResponse.json({ error: "Seu plano não inclui multitracks" }, { status: 403 });
    }

    if (currentCount >= multitrackLimit) {
      return NextResponse.json({
        error: `Cota mensal atingida (${currentCount}/${multitrackLimit}). Faça upgrade ou alugue avulso.`,
        code: "QUOTA_EXCEEDED",
      }, { status: 402 });
    }

    // Buscar album
    const album = await prisma.multitracksAlbum.findUnique({ where: { id: albumId } });
    if (!album || album.status !== "READY") {
      return NextResponse.json({ error: "Multitrack não disponível" }, { status: 404 });
    }

    const stems = Array.isArray(album.stems) ? album.stems as { name: string; driveUrl: string; r2Key: string | null }[] : [];
    if (stems.length === 0) {
      return NextResponse.json({ error: "Multitrack sem stems configurados" }, { status: 400 });
    }

    // Copiar stems para R2
    const s3Client = createS3Client();
    const { bucketName } = getBucketConfig();
    const r2Folder = `multitracks/${user.groupId}/${albumId}`;

    const copyResults = await Promise.all(
      stems.map(async (stem) => {
        const r2Key = `${r2Folder}/${stem.name.toLowerCase().replace(/\s+/g, "-")}.mp3`;
        const success = await copyDriveFileToR2(stem.driveUrl, r2Key, s3Client, bucketName);
        return { ...stem, r2Key: success ? r2Key : null };
      })
    );

    const allOk = copyResults.every((s) => s.r2Key !== null);
    if (!allOk) {
      console.error("[multitracks/rent] Some stems failed to copy");
    }

    // Criar/atualizar rental
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rental = await prisma.multitracksRental.upsert({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      create: {
        groupId: user.groupId,
        albumId,
        rentedBy: user.id,
        r2Folder,
        status: "ACTIVE",
        expiresAt,
      },
      update: {
        rentedBy: user.id,
        r2Folder,
        status: "ACTIVE",
        rentedAt: now,
        expiresAt,
      },
    });

    // Incrementar cota
    await prisma.multitracksUsage.upsert({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
      create: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear(), count: 1 },
      update: { count: { increment: 1 } },
    });

    return NextResponse.json({ rental, stemsReady: allOk });
  } catch (err) {
    console.error("[multitracks/rent] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
