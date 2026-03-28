export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { getGroupEntitlements } from "@/lib/billing/entitlements";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatório" }, { status: 400 });

    // Verificar entitlements via sistema novo
    const ent = await getGroupEntitlements(user.groupId);

    if (!ent.isActive) {
      return NextResponse.json({ error: "Assinatura inativa. Reative para alugar multitracks." }, { status: 402 });
    }

    if (!ent.canAccessMultitracks) {
      return NextResponse.json({
        error: "Seu plano não inclui multitracks. Faça upgrade.",
        code: "PLAN_UPGRADE_REQUIRED",
        requiredFeature: "multitracks",
      }, { status: 402 });
    }

    const existing = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
    });
    if (existing?.status === "ACTIVE" && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "Multitrack já alugada e ativa" }, { status: 409 });
    }

    // Verificar cota mensal
    const now = new Date();
    const usageRecord = await prisma.multitracksUsage.findUnique({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    const currentCount = usageRecord?.count ?? 0;
    const limit = ent.multitracksPerMonth;

    if (currentCount >= limit) {
      return NextResponse.json({
        error: `Cota mensal atingida (${currentCount}/${limit}). Aguarde o próximo mês ou adquira um multitrack avulso.`,
        code: "QUOTA_EXCEEDED",
        usage: { count: currentCount, limit },
      }, { status: 402 });
    }

    const album = await prisma.multitracksAlbum.findUnique({ where: { id: albumId } });
    if (!album || album.status !== "READY" || !album.isActive) {
      return NextResponse.json({ error: "Multitrack não disponível" }, { status: 404 });
    }

    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const rental = await prisma.multitracksRental.upsert({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
      create: {
        groupId: user.groupId,
        albumId,
        rentedBy: user.id,
        r2Folder: `multitracks-catalog/${albumId}`,
        status: "ACTIVE",
        expiresAt,
      },
      update: {
        rentedBy: user.id,
        r2Folder: `multitracks-catalog/${albumId}`,
        status: "ACTIVE",
        rentedAt: now,
        expiresAt,
      },
    });

    await prisma.multitracksUsage.upsert({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
      create: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear(), count: 1 },
      update: { count: { increment: 1 } },
    });

    return NextResponse.json({ rental, usage: { count: currentCount + 1, limit } });
  } catch (err) {
    console.error("[multitracks/rent] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
