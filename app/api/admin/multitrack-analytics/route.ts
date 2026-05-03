export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function isSuperAdmin(user: any) {
  return user?.role === "SUPERADMIN";
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { rentedAt: { gte: since } };
  if (groupId) where.groupId = groupId;

  // ── Visão geral ───────────────────────────────────────────────────────────
  const [totalRentals, activeRentals, totalGroups, revenueRentals] = await Promise.all([
    prisma.multitracksRental.count({ where }),
    prisma.multitracksRental.count({ where: { ...where, status: "ACTIVE", expiresAt: { gt: new Date() } } }),
    prisma.multitracksRental.groupBy({ by: ["groupId"], where }).then((r) => r.length),
    prisma.multitracksRental.findMany({
      where,
      select: { groupId: true, rentedAt: true },
    }),
  ]);

  // ── Top tracks mais alugadas ──────────────────────────────────────────────
  const topTracksRaw = await prisma.multitracksRental.groupBy({
    by: ["albumId"],
    where,
    _count: { albumId: true },
    orderBy: { _count: { albumId: "desc" } },
    take: 10,
  });

  const albumIds = topTracksRaw.map((t) => t.albumId);
  const albums = await prisma.multitracksAlbum.findMany({
    where: { id: { in: albumIds } },
    select: { id: true, title: true, artist: true, coverUrl: true },
  });
  const albumMap = new Map(albums.map((a) => [a.id, a]));

  const topTracks = topTracksRaw.map((t) => ({
    album: albumMap.get(t.albumId),
    count: t._count.albumId,
  }));

  // ── Aluguéis por ministério ───────────────────────────────────────────────
  const byGroupRaw = await prisma.multitracksRental.groupBy({
    by: ["groupId"],
    where,
    _count: { groupId: true },
    orderBy: { _count: { groupId: "desc" } },
    take: 20,
  });

  const groupIds = byGroupRaw.map((g) => g.groupId);
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { status: true, trialEndsAt: true },
      },
    },
  });
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  const byGroup = byGroupRaw.map((g) => {
    const group = groupMap.get(g.groupId);
    const sub = group?.subscription;
    return {
      groupId: g.groupId,
      groupName: group?.name ?? "Desconhecido",
      count: g._count.groupId,
      subscriptionStatus: sub?.status ?? "NO_SUBSCRIPTION",
      trialEndsAt: sub?.trialEndsAt ?? null,
    };
  });

  // ── Detector de abuso de trial ────────────────────────────────────────────
  // Grupos em TRIALING que alugaram multitracks mas nunca assinaram de verdade
  const trialAbuseSuspects = await prisma.group.findMany({
    where: {
      subscription: {
        is: { status: "TRIALING" },
      },
      multitracksRentals: { some: {} },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      users: {
        where: { role: "ADMIN" },
        select: { name: true, email: true, createdAt: true, lastLoginAt: true },
        take: 1,
      },
      subscription: {
        select: { status: true, trialEndsAt: true, createdAt: true },
      },
      multitracksRentals: {
        select: { rentedAt: true, expiresAt: true, status: true },
        orderBy: { rentedAt: "desc" },
      },
      _count: { select: { multitracksRentals: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Buscar outros grupos com e-mails similares (mesmo domínio/base)
  const adminEmails = trialAbuseSuspects.map((g) => g.users[0]?.email).filter(Boolean);
  
  // Agrupar por domínio de e-mail para detectar padrão
  const emailDomainMap = new Map<string, typeof trialAbuseSuspects>();
  for (const group of trialAbuseSuspects) {
    const email = group.users[0]?.email;
    if (!email) continue;
    const domain = email.split("@")[1];
    if (!emailDomainMap.has(domain)) emailDomainMap.set(domain, []);
    emailDomainMap.get(domain)!.push(group);
  }

  // Identificar grupos com mesmo domínio (possível abuso)
  const suspectedAbusers = trialAbuseSuspects.map((g) => {
    const email = g.users[0]?.email ?? "";
    const domain = email.split("@")[1];
    const samedomainGroups = (emailDomainMap.get(domain) ?? []).filter((x) => x.id !== g.id);
    const sub = g.subscription;
    const trialDaysLeft = sub?.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

    return {
      groupId: g.id,
      groupName: g.name,
      groupCreatedAt: g.createdAt,
      adminName: g.users[0]?.name ?? "",
      adminEmail: email,
      lastLogin: g.users[0]?.lastLoginAt ?? null,
      subscriptionStatus: sub?.status ?? "NO_SUBSCRIPTION",
      trialEndsAt: sub?.trialEndsAt ?? null,
      trialDaysLeft,
      totalRentals: g._count.multitracksRentals,
      rentals: g.multitracksRentals,
      riskLevel: samedomainGroups.length > 0 ? "HIGH" : g._count.multitracksRentals >= 3 ? "MEDIUM" : "LOW",
      sameEmailDomainGroups: samedomainGroups.map((x) => ({ id: x.id, name: x.name })),
    };
  });

  // ── Evolução temporal (aluguéis por dia) ─────────────────────────────────
  const rentalsByDay = await prisma.multitracksRental.findMany({
    where,
    select: { rentedAt: true },
    orderBy: { rentedAt: "asc" },
  });

  const dayMap = new Map<string, number>();
  for (const r of rentalsByDay) {
    const day = r.rentedAt.toISOString().split("T")[0];
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const timeline = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    overview: {
      totalRentals,
      activeRentals,
      totalGroups,
      period: `${days} dias`,
    },
    topTracks,
    byGroup,
    suspectedAbusers: suspectedAbusers.sort((a, b) =>
      a.riskLevel === "HIGH" ? -1 : b.riskLevel === "HIGH" ? 1 : 0
    ),
    timeline,
  });
}
