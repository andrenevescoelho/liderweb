export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

async function getQuota(groupId: string): Promise<{ limit: number; used: number }> {
  const subscription = await prisma.subscription.findUnique({
    where: { groupId },
    include: { plan: true, billingPlan: true },
  });

  const isActive = ["ACTIVE", "TRIALING"].includes(subscription?.status ?? "");
  if (!isActive) return { limit: 0, used: 0 };

  let limit = 0;

  if ((subscription as any)?.billingPlan) {
    const f = ((subscription as any).billingPlan.features as any) ?? {};
    limit = Number(f["custom-mix"] ?? f.customMix ?? 0);
  } else {
    const planName = (subscription?.plan?.name ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (planName.includes("avancado")) limit = 10;
    else if (planName.includes("igreja") || planName.includes("enterprise")) limit = 20;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Usar SQL raw para evitar problema de client cache
  const usedRaw = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM "CustomMix"
    WHERE "groupId" = ${groupId} AND "createdAt" >= ${startOfMonth}
  `;
  const used = Number(usedRaw[0]?.count ?? 0);

  const extrasRaw = await prisma.$queryRaw<{ quantity: number }[]>`
    SELECT COALESCE(SUM(quantity), 0)::int as quantity FROM "CustomMixExtra"
    WHERE "groupId" = ${groupId}
    AND month = ${now.getMonth() + 1} AND year = ${now.getFullYear()}
  `;
  const extraLimit = Number(extrasRaw[0]?.quantity ?? 0);

  return { limit: limit + extraLimit, used };
}

// GET — listar mixes do grupo
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { limit, used } = await getQuota(user.groupId);

    const mixes = await prisma.$queryRaw<any[]>`
      SELECT cm.*, row_to_json(ma) as album
      FROM "CustomMix" cm
      JOIN (
        SELECT id, title, artist, "coverUrl" FROM "MultitracksAlbum"
      ) ma ON ma.id = cm."albumId"
      WHERE cm."groupId" = ${user.groupId}
      ORDER BY cm."createdAt" DESC
    `;

    return NextResponse.json({ mixes, quota: { limit, used, remaining: Math.max(0, limit - used) } });
  } catch (error: any) {
    console.error('[custom-mix GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — criar novo mix
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { limit, used } = await getQuota(user.groupId);
    if (limit === 0) return NextResponse.json({ error: "UPGRADE_REQUIRED", message: "Custom Mix está disponível nos planos Avançado e Igreja." }, { status: 402 });
    if (used >= limit) return NextResponse.json({ error: "QUOTA_EXCEEDED", message: `Você atingiu o limite de ${limit} Custom Mix este mês.` }, { status: 402 });

    const { name, albumId, config, durationSec, fileKey } = await req.json();
    if (!name || !albumId || !config) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

    const album = await prisma.multitracksAlbum.findUnique({ where: { id: albumId } });
    if (!album) return NextResponse.json({ error: "Multitrack não encontrada" }, { status: 404 });

    const mix = await prisma.$queryRaw<any[]>`
      INSERT INTO "CustomMix" (id, name, "albumId", "groupId", "userId", config, "fileKey", "durationSec", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${name}, ${albumId}, ${user.groupId}, ${user.id}, ${JSON.stringify(config)}::jsonb, ${fileKey ?? null}, ${durationSec ?? null}, NOW(), NOW())
      RETURNING *
    `;

    return NextResponse.json({ mix: { ...mix[0], album: { title: album.title, artist: album.artist, coverUrl: album.coverUrl } } });
  } catch (error: any) {
    console.error('[custom-mix POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — atualizar fileKey
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mixId = searchParams.get("id");
    if (!mixId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const { fileKey } = await req.json();
    if (!fileKey) return NextResponse.json({ error: "fileKey obrigatório" }, { status: 400 });

    await prisma.$executeRaw`
      UPDATE "CustomMix" SET "fileKey" = ${fileKey}, "updatedAt" = NOW()
      WHERE id = ${mixId} AND "groupId" = ${user.groupId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remover mix
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const mixId = searchParams.get("id");
    if (!mixId) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    await prisma.$executeRaw`
      DELETE FROM "CustomMix" WHERE id = ${mixId} AND "groupId" = ${user.groupId}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
