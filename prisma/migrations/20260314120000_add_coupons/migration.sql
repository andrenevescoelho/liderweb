CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE_DISCOUNT', 'FREE_PLAN');
CREATE TYPE "PlanTier" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'ENTERPRISE');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CouponType" NOT NULL,
  "discountPercent" INTEGER,
  "freePlanTier" "PlanTier",
  "freePlanDurationDays" INTEGER,
  "allowedPlanTiers" "PlanTier"[] DEFAULT ARRAY[]::"PlanTier"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponRedemption" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "redeemedByUserId" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "benefitStartAt" TIMESTAMP(3) NOT NULL,
  "benefitEndAt" TIMESTAMP(3),
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "snapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");
CREATE INDEX "CouponRedemption_subscriptionId_status_idx" ON "CouponRedemption"("subscriptionId", "status");
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

ALTER TABLE "Coupon"
ADD CONSTRAINT "Coupon_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
ADD CONSTRAINT "CouponRedemption_couponId_fkey"
FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
ADD CONSTRAINT "CouponRedemption_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
ADD CONSTRAINT "CouponRedemption_redeemedByUserId_fkey"
FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
