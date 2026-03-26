import { Coupon, CouponRedemption, CouponRedemptionStatus, CouponType, PlanTier, SubscriptionPlan } from "@prisma/client";

export const PLAN_NAME_TO_TIER: Record<string, PlanTier> = {
  "básico": "BASIC",
  basico: "BASIC",
  "intermediário": "INTERMEDIATE",
  intermediario: "INTERMEDIATE",
  "avançado": "ADVANCED",
  avancado: "ADVANCED",
  enterprise: "ENTERPRISE",
};

const PLAN_TIER_METADATA: Record<PlanTier, { name: string; userLimit: number }> = {
  BASIC: { name: "Básico", userLimit: 15 },
  INTERMEDIATE: { name: "Intermediário", userLimit: 30 },
  ADVANCED: { name: "Avançado", userLimit: 100 },
  ENTERPRISE: { name: "Enterprise", userLimit: 0 },
};

export function getPlanTierFromPlanName(name?: string | null): PlanTier | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return PLAN_NAME_TO_TIER[normalized] ?? null;
}

export function getCouponStatusLabel(coupon: Pick<Coupon, "isActive" | "validUntil" | "maxUses" | "usedCount">, now = new Date()) {
  if (!coupon.isActive) return "inativo";
  if (coupon.validUntil && coupon.validUntil < now) return "expirado";
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return "esgotado";
  return "ativo";
}

export function isCouponRedeemable(coupon: Pick<Coupon, "isActive" | "validFrom" | "validUntil" | "maxUses" | "usedCount">, now = new Date()) {
  if (!coupon.isActive) return { ok: false, reason: "Cupom inativo" };
  if (coupon.validFrom && coupon.validFrom > now) return { ok: false, reason: "Cupom ainda não está válido" };
  if (coupon.validUntil && coupon.validUntil < now) return { ok: false, reason: "Cupom expirado" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false, reason: "Cupom esgotado" };
  return { ok: true };
}

export function buildCouponBenefitSummary(coupon: Pick<Coupon, "type" | "discountPercent" | "freePlanTier" | "freePlanDurationDays">) {
  if (coupon.type === "PERCENTAGE_DISCOUNT") {
    return `${coupon.discountPercent ?? 0}% de desconto na mensalidade`;
  }
  return `Plano ${coupon.freePlanTier ?? "-"} grátis por ${coupon.freePlanDurationDays ?? 0} dias`;
}

export function computeSubscriptionPriceWithCoupon(plan: Pick<SubscriptionPlan, "price">, redemption?: (Pick<CouponRedemption, "status" | "benefitStartAt" | "benefitEndAt"> & { coupon: Pick<Coupon, "type" | "discountPercent" | "isActive"> }) | null, now = new Date()) {
  const originalPrice = plan.price;
  if (!redemption || redemption.status !== "ACTIVE") {
    return { originalPrice, effectivePrice: originalPrice, discountPercent: 0 };
  }
  if (!redemption.coupon.isActive) {
    return { originalPrice, effectivePrice: originalPrice, discountPercent: 0 };
  }

  if (redemption.benefitStartAt > now) {
    return { originalPrice, effectivePrice: originalPrice, discountPercent: 0 };
  }

  if (redemption.benefitEndAt && redemption.benefitEndAt < now) {
    return { originalPrice, effectivePrice: originalPrice, discountPercent: 0 };
  }

  if (redemption.coupon.type === "FREE_PLAN") {
    return { originalPrice, effectivePrice: 0, discountPercent: 100 };
  }

  const discountPercent = Math.max(0, Math.min(100, redemption.coupon.discountPercent ?? 0));
  const effectivePrice = Number((originalPrice * (1 - discountPercent / 100)).toFixed(2));

  return { originalPrice, effectivePrice, discountPercent };
}

export function redemptionIsActive(
  redemption: Pick<CouponRedemption, "status" | "benefitStartAt" | "benefitEndAt"> & { coupon?: Pick<Coupon, "isActive"> | null },
  now = new Date()
) {
  if (redemption.status !== CouponRedemptionStatus.ACTIVE) return false;
  if (redemption.coupon && !redemption.coupon.isActive) return false;
  if (redemption.benefitStartAt > now) return false;
  if (redemption.benefitEndAt && redemption.benefitEndAt < now) return false;
  return true;
}

type EffectivePlanSource = Pick<SubscriptionPlan, "name" | "userLimit">;
type EffectiveRedemptionSource = Pick<CouponRedemption, "status" | "benefitStartAt" | "benefitEndAt"> & {
  coupon: Pick<Coupon, "type" | "freePlanTier" | "isActive">;
};

export function getEffectivePlanFromCoupon(
  plan: EffectivePlanSource,
  redemption?: EffectiveRedemptionSource | null,
  now = new Date()
) {
  if (!redemption || !redemptionIsActive(redemption, now)) {
    return plan;
  }

  if (redemption.coupon.type !== CouponType.FREE_PLAN || !redemption.coupon.freePlanTier) {
    return plan;
  }

  const couponPlan = PLAN_TIER_METADATA[redemption.coupon.freePlanTier];
  if (!couponPlan) {
    return plan;
  }

  return {
    name: couponPlan.name,
    userLimit: couponPlan.userLimit,
  };
}
