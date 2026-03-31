export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { getLocalStats, getGlobalStats, generateInsights } from "@/lib/musicAnalyticsService";
import { getModuleAccess } from "@/lib/subscription-features";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!session || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!["ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    // SUPERADMIN sempre tem acesso
    if (user.role !== "SUPERADMIN" && user.groupId) {
      const subscription = await prisma.subscription.findUnique({
        where: { groupId: user.groupId },
        include: { plan: true, billingPlan: true },
      });

      const isActive = ["ACTIVE", "TRIALING"].includes(subscription?.status ?? "");
      if (!isActive) {
        return NextResponse.json({ error: "PLAN_REQUIRED", message: "Este recurso requer uma assinatura ativa." }, { status: 402 });
      }

      // Verificar se o plano tem acesso (todos exceto gratuito)
      const planName = (subscription?.billingPlan?.name ?? subscription?.plan?.name ?? "").toLowerCase();
      const isFree = planName.includes("gratu") || planName.includes("free");
      if (isFree) {
        return NextResponse.json({ error: "UPGRADE_REQUIRED", message: "Analytics Musicais está disponível a partir do plano Básico." }, { status: 402 });
      }
    }

    const groupId = user.groupId;

    const [local, global] = await Promise.all([
      groupId ? getLocalStats(groupId) : null,
      getGlobalStats(),
    ]);

    const insights = local && global ? generateInsights(local, global) : [];

    return NextResponse.json({ local, global, insights });
  } catch (error: any) {
    console.error("Music analytics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
