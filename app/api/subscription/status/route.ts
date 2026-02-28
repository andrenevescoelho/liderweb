export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.groupId) {
      return NextResponse.json({ hasSubscription: false });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: { plan: true },
    });

    if (!subscription) {
      return NextResponse.json({ hasSubscription: false });
    }

    const isActive = ["ACTIVE", "TRIALING"].includes(subscription.status);

    // Contar usuários do grupo
    const userCount = await prisma.user.count({
      where: { groupId: user.groupId },
    });

    return NextResponse.json({
      hasSubscription: true,
      isActive,
      subscription: {
        status: subscription.status,
        planName: subscription.plan.name,
        userLimit: subscription.plan.userLimit,
        userCount,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        hasStripeCustomer: Boolean(subscription.stripeCustomerId),
      },
    });
  } catch (error: any) {
    console.error("Subscription status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
