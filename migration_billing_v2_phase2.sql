-- Migration: billing_v2_phase2
-- Adiciona PaymentTransaction e WebhookEvent para histórico e idempotência

CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

CREATE TABLE "PaymentTransaction" (
  "id"                     TEXT NOT NULL,
  "groupId"                TEXT NOT NULL,
  "billingPlanId"          TEXT,
  "gateway"                "BillingGateway" NOT NULL,
  "externalId"             TEXT NOT NULL,
  "externalSubscriptionId" TEXT,
  "status"                 "PaymentTransactionStatus" NOT NULL,
  "amount"                 DOUBLE PRECISION NOT NULL,
  "currency"               TEXT NOT NULL DEFAULT 'BRL',
  "description"            TEXT,
  "paidAt"                 TIMESTAMP(3),
  "failedAt"               TIMESTAMP(3),
  "failureReason"          TEXT,
  "gatewayData"            JSONB,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentTransaction_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE,
  CONSTRAINT "PaymentTransaction_billingPlanId_fkey"
    FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "PaymentTransaction_gateway_externalId_key" ON "PaymentTransaction"("gateway", "externalId");
CREATE INDEX "PaymentTransaction_groupId_status_idx" ON "PaymentTransaction"("groupId", "status");
CREATE INDEX "PaymentTransaction_groupId_createdAt_idx" ON "PaymentTransaction"("groupId", "createdAt");

CREATE TABLE "WebhookEvent" (
  "id"           TEXT NOT NULL,
  "gateway"      "BillingGateway" NOT NULL,
  "externalId"   TEXT NOT NULL,
  "eventType"    TEXT NOT NULL,
  "status"       "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload"      JSONB NOT NULL,
  "errorMessage" TEXT,
  "processedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_gateway_externalId_key" ON "WebhookEvent"("gateway", "externalId");
CREATE INDEX "WebhookEvent_gateway_eventType_idx" ON "WebhookEvent"("gateway", "eventType");
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

CREATE TRIGGER update_paymenttransaction_updated_at
  BEFORE UPDATE ON "PaymentTransaction"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
