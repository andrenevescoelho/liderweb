export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { can } from "@/lib/rbac";
import { getModuleAccess } from "@/lib/subscription-features";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;

    if (!can(user, "multitrack.view")) {
      return NextResponse.json({ error: "Sem permissão para acessar multitracks" }, { status: 403 });
    }
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: { plan: true },
    });
    const moduleAccess = getModuleAccess(subscription?.plan?.features, subscription?.plan?.name);
    if (moduleAccess.multitracks <= 0) {
      return NextResponse.json(
        { error: "Seu plano atual não inclui acesso ao módulo Multitracks.", code: "PLAN_UPGRADE_REQUIRED" },
        { status: 402 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("q") || "";
    const genre = searchParams.get("genre") || "";

    const albums = await prisma.multitracksAlbum.findMany({
      where: {
        isActive: true,
        status: "READY",
        ...(search ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { artist: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
        ...(genre ? { genre } : {}),
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        bpm: true,
        musicalKey: true,
        coverUrl: true,
        description: true,
        stems: true,
        createdAt: true,
      },
    });

    const rentals = await prisma.multitracksRental.findMany({
      where: { groupId: user.groupId, status: "ACTIVE" },
      select: { albumId: true, expiresAt: true, status: true },
    });

    const rentalMap = new Map(rentals.map((r) => [r.albumId, r]));
    const result = albums.map((album) => {
      const rental = rentalMap.get(album.id);
      const stemsArr = Array.isArray(album.stems) ? album.stems : [];
      return {
        ...album,
        stemCount: stemsArr.length,
        stems: undefined,
        rented: !!rental,
        expiresAt: rental?.expiresAt ?? null,
      };
    });

    let usage = { count: 0, limit: 0 };
    if (can(user, "multitrack.rent")) {
      const now = new Date();
      const usageRecord = await prisma.multitracksUsage.findUnique({
        where: { groupId_month_year: { groupId: user.groupId, month: now.getMonth() + 1, year: now.getFullYear() } },
      });
      usage = { count: usageRecord?.count ?? 0, limit: moduleAccess.multitracks };
    }

    return NextResponse.json({ albums: result, usage, canRent: can(user, "multitrack.rent") });
  } catch (err) {
    console.error("[multitracks] GET error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
