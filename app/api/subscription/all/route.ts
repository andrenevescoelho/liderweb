export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser;

    if (!session || user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");

    const where: any = {};
    if (status && status !== "all") {
      where.status = status;
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        group: {
          include: {
            _count: {
              select: { users: true },
            },
          },
        },
        plan: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Buscar grupos sem assinatura também
    const groupsWithoutSubscription = await prisma.group.findMany({
      where: {
        subscription: null,
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    // Estatísticas
    const stats = {
      total: subscriptions.length + groupsWithoutSubscription.length,
      active: subscriptions.filter((s) => s.status === "ACTIVE").length,
      trialing: subscriptions.filter((s) => s.status === "TRIALING").length,
      canceled: subscriptions.filter((s) => s.status === "CANCELED").length,
      pastDue: subscriptions.filter((s) => s.status === "PAST_DUE").length,
      noSubscription: groupsWithoutSubscription.length,
    };

    return NextResponse.json({
      subscriptions,
      groupsWithoutSubscription,
      stats,
    });
  } catch (error: any) {
    console.error("Get all subscriptions error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
