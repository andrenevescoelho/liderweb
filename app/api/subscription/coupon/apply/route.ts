export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { buildCouponBenefitSummary, getPlanTierFromPlanName, isCouponRedeemable } from "@/lib/coupons";
import { CouponRedemptionStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const canApply = user.role === "ADMIN" || user.role === "SUPERADMIN" || (user.permissions ?? []).includes("apply_coupon_to_subscription");
    if (!canApply) {
      return NextResponse.json({ error: "Sem permissão para aplicar cupom" }, { status: 403 });
    }

    const body = await req.json();
    const code = String(body.code ?? "").trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: "Informe um código de cupom" }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
      include: {
        plan: true,
        couponRedemptions: {
          where: { status: CouponRedemptionStatus.ACTIVE },
          orderBy: { redeemedAt: "desc" },
          include: { coupon: true },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Seu grupo não possui assinatura ativa" }, { status: 400 });
    }

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) {
      return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
    }

    const redeemable = isCouponRedeemable(coupon);
    if (!redeemable.ok) {
      return NextResponse.json({ error: redeemable.reason }, { status: 400 });
    }

    const currentPlanTier = getPlanTierFromPlanName(subscription.plan.name);
    if (coupon.allowedPlanTiers.length && (!currentPlanTier || !coupon.allowedPlanTiers.includes(currentPlanTier))) {
      return NextResponse.json({ error: "Cupom não é compatível com o plano atual" }, { status: 400 });
    }

    if (coupon.type === "FREE_PLAN" && coupon.freePlanTier && currentPlanTier && coupon.freePlanTier !== currentPlanTier) {
      return NextResponse.json({ error: "Cupom de plano gratuito não é compatível com seu plano atual" }, { status: 400 });
    }

    const now = new Date();
    const benefitStartAt = now;
    const benefitEndAt =
      coupon.type === "FREE_PLAN"
        ? new Date(now.getTime() + (coupon.freePlanDurationDays ?? 0) * 24 * 60 * 60 * 1000)
        : null;

    const activeRedemptions = subscription.couponRedemptions;

    const redemption = await prisma.$transaction(async (tx) => {
      if (activeRedemptions.length) {
        await tx.couponRedemption.updateMany({
          where: { id: { in: activeRedemptions.map((item) => item.id) } },
          data: { status: CouponRedemptionStatus.EXPIRED },
        });
      }

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      return tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          subscriptionId: subscription.id,
          redeemedByUserId: user.id,
          benefitStartAt,
          benefitEndAt,
          status: CouponRedemptionStatus.ACTIVE,
          snapshotJson: {
            code: coupon.code,
            name: coupon.name,
            type: coupon.type,
            discountPercent: coupon.discountPercent,
            freePlanTier: coupon.freePlanTier,
            freePlanDurationDays: coupon.freePlanDurationDays,
            allowedPlanTiers: coupon.allowedPlanTiers,
            appliedAt: now.toISOString(),
          },
        },
        include: { coupon: true },
      });
    });

    return NextResponse.json({
      success: true,
      redemption,
      summary: buildCouponBenefitSummary(coupon),
    });
  } catch (error: any) {
    console.error("Apply coupon error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
