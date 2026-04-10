export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getInvoiceHistory, createBillingPortal, cancelSubscription, reactivateSubscription } from "@/lib/billing/gateway";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const subscription = await (prisma as any).subscription.findUnique({
      where: { groupId: user.groupId },
      include: {
        plan: true,
        billingPlan: {
          include: { gatewayMappings: { where: { isActive: true } } },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ hasSubscription: false });
    }

    const isActive = ["ACTIVE", "TRIALING"].includes(subscription.status);
    const userCount = await prisma.user.count({ where: { groupId: user.groupId } });

    // Buscar histórico — primeiro tenta Stripe, cai para banco local
    let invoices: any[] = [];
    if (subscription.stripeCustomerId) {
      invoices = await getInvoiceHistory("STRIPE", subscription.stripeCustomerId, 10);
    } else {
      invoices = await getInvoiceHistory("MANUAL", user.groupId, 10);
    }

    const plan = subscription.billingPlan ?? subscription.plan;

    return NextResponse.json({
      hasSubscription: true,
      isActive,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planName: plan?.name ?? "—",
        planSlug: subscription.billingPlan?.slug ?? null,
        price: subscription.billingPlan?.price ?? subscription.plan?.price ?? 0,
        period: subscription.billingPlan?.period ?? "MONTHLY",
        userLimit: subscription.billingPlan?.userLimit ?? subscription.plan?.userLimit ?? 0,
        userCount,
        features: subscription.billingPlan?.features ?? {},
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelAt: (subscription as any).cancelAt ?? null,
        trialEndingNotified: (subscription as any).trialEndingNotified ?? false,
        hasStripeCustomer: Boolean(subscription.stripeCustomerId),
        hasStripeSubscription: Boolean(subscription.stripeSubscriptionId),
        gateway: subscription.stripeSubscriptionId ? "STRIPE" : "MANUAL",
      },
      invoices,
    });
  } catch (error: any) {
    console.error("[billing/my-plan] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar dados" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { action } = await req.json();
    const origin = req.headers.get("origin") || "https://liderweb.multitrackgospel.com";

    const subscription = await (prisma as any).subscription.findUnique({
      where: { groupId: user.groupId },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 });
    }

    switch (action) {
      case "portal": {
        if (!subscription.stripeCustomerId) {
          return NextResponse.json({ error: "Sem customer no gateway" }, { status: 400 });
        }
        const portal = await createBillingPortal({
          gateway: "STRIPE",
          stripeCustomerId: subscription.stripeCustomerId,
          returnUrl: `${origin}/meu-plano`,
        });
        return NextResponse.json({ url: portal.url });
      }

      case "cancel": {
        if (!subscription.stripeSubscriptionId) {
          return NextResponse.json({ error: "Sem assinatura ativa no gateway" }, { status: 400 });
        }
        await cancelSubscription("STRIPE", subscription.stripeSubscriptionId, true);
        await (prisma as any).subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: true },
        });
        return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
      }

      case "reactivate": {
        if (!subscription.stripeSubscriptionId) {
          return NextResponse.json({ error: "Sem assinatura no gateway" }, { status: 400 });
        }
        await reactivateSubscription("STRIPE", subscription.stripeSubscriptionId);
        await (prisma as any).subscription.update({
          where: { id: subscription.id },
          data: { cancelAtPeriodEnd: false },
        });
        return NextResponse.json({ ok: true, cancelAtPeriodEnd: false });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[billing/my-plan] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
