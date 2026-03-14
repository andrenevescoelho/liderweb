export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { buildCouponBenefitSummary, computeSubscriptionPriceWithCoupon, redemptionIsActive } from "@/lib/coupons";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.groupId) {
      return NextResponse.json({ hasSubscription: false });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: {
        plan: true,
        couponRedemptions: {
          where: { status: "ACTIVE" },
          orderBy: { redeemedAt: "desc" },
          take: 1,
          include: { coupon: true },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ hasSubscription: false });
    }

    const isActive = ["ACTIVE", "TRIALING"].includes(subscription.status);

    // Contar usuários do grupo
    const userCount = await prisma.user.count({
      where: { groupId: user.groupId },
    });

    const activeRedemption = subscription.couponRedemptions[0];
    const hasActiveCoupon = activeRedemption ? redemptionIsActive(activeRedemption) : false;
    const pricing = computeSubscriptionPriceWithCoupon(
      subscription.plan,
      hasActiveCoupon && activeRedemption
        ? {
            status: activeRedemption.status,
            benefitStartAt: activeRedemption.benefitStartAt,
            benefitEndAt: activeRedemption.benefitEndAt,
            coupon: {
              type: activeRedemption.coupon.type,
              discountPercent: activeRedemption.coupon.discountPercent,
            },
          }
        : null
    );

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
        originalPrice: pricing.originalPrice,
        effectivePrice: pricing.effectivePrice,
        discountPercent: pricing.discountPercent,
        activeCoupon: hasActiveCoupon && activeRedemption
          ? {
              code: activeRedemption.coupon.code,
              name: activeRedemption.coupon.name,
              type: activeRedemption.coupon.type,
              benefitSummary: buildCouponBenefitSummary(activeRedemption.coupon),
              benefitStartAt: activeRedemption.benefitStartAt,
              benefitEndAt: activeRedemption.benefitEndAt,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error("Subscription status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
