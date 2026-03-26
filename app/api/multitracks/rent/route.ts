export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { can } from "@/lib/rbac";
import { getModuleAccess } from "@/lib/subscription-features";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    if (!can(user, "multitrack.rent")) {
      return NextResponse.json({ error: "Sem permissão para alugar multitracks" }, { status: 403 });
    }

    const { albumId } = await req.json();
    if (!albumId) return NextResponse.json({ error: "albumId obrigatório" }, { status: 400 });

    const existing = await prisma.multitracksRental.findUnique({
      where: { groupId_albumId: { groupId: user.groupId, albumId } },
    });
    if (existing?.status === "ACTIVE" && existing.expiresAt > new Date()) {
      return NextResponse.json({ error: "Multitrack já alugada e ativa" }, { status: 409 });
    }

    const now = new Date();
    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: { plan: true },
    });
    const moduleAccess = getModuleAccess(subscription?.plan?.features, subscription?.plan?.name);
    const multitrackLimit = moduleAccess.multitracks;

    if (multitrackLimit === 0) {
      return NextResponse.json({ error: "Seu plano não inclui multitracks. Faça upgrade." }, { status: 402 });
    }

    const usageRecord = await prisma.multitracksUsage.findUnique({
      where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
    });
    const currentCount = usageRecord?.count ?? 0;

    if (currentCount >= multitrackLimit) {
      return NextResponse.json({
        error: `Cota mensal atingida (${currentCount}/${multitrackLimit}).`,
        code: "QUOTA_EXCEEDED",
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

    return NextResponse.json({ rental });
  } catch (err) {
    console.error("[multitracks/rent] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
