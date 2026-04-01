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

  if (subscription?.billingPlan) {
    // Novo sistema — ler direto das features do BillingPlan
    const f = (subscription.billingPlan.features as any) ?? {};
    limit = Number(f["custom-mix"] ?? f.customMix ?? 0);
  } else {
    // Fallback: tentar encontrar BillingPlan pelo nome do plano legado
    const planName = (subscription?.plan?.name ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const slug = planName.replace(/\s+/g, "-");
    const bp = await (prisma as any).billingPlan.findFirst({
      where: { OR: [{ slug }, { name: { contains: subscription?.plan?.name ?? "" } }], status: "ACTIVE" },
    });
    if (bp) {
      const f = (bp.features as any) ?? {};
      limit = Number(f["custom-mix"] ?? f.customMix ?? 0);
    } else {
      // Último fallback: hardcoded por nome
      if (planName.includes("avancado")) limit = 10;
      else if (planName.includes("igreja") || planName.includes("enterprise")) limit = 20;
    }
  }

  // Contar mixes criados no mês atual
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const used = await (prisma as any).customMix.count({
    where: { groupId, createdAt: { gte: startOfMonth } },
  });

  return { limit, used };
}

// GET — listar mixes do grupo
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { limit, used } = await getQuota(user.groupId);

    const mixes = await (prisma as any).customMix.findMany({
      where: { groupId: user.groupId },
      include: { album: { select: { title: true, artist: true, coverUrl: true, stems: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ mixes, quota: { limit, used, remaining: Math.max(0, limit - used) } });
  } catch (error: any) {
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

    const { name, albumId, config, durationSec } = await req.json();
    if (!name || !albumId || !config) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

    // Verificar que o album existe
    const album = await prisma.multitracksAlbum.findUnique({ where: { id: albumId } });
    if (!album) return NextResponse.json({ error: "Multitrack não encontrada" }, { status: 404 });

    const mix = await (prisma as any).customMix.create({
      data: { name, albumId, groupId: user.groupId, userId: user.id, config, durationSec },
      include: { album: { select: { title: true, artist: true, coverUrl: true, stems: true } } },
    });

    return NextResponse.json({ mix });
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

    const mix = await (prisma as any).customMix.findFirst({ where: { id: mixId, groupId: user.groupId } });
    if (!mix) return NextResponse.json({ error: "Mix não encontrado" }, { status: 404 });

    await (prisma as any).customMix.delete({ where: { id: mixId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
