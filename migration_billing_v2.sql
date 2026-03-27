-- Migration: billing_v2_phase1
-- Adiciona BillingPlan, BillingGatewayMapping e billingPlanId na Subscription
-- NÃO remove nada do schema antigo — migração gradual e segura

-- Enums novos
CREATE TYPE "BillingGateway" AS ENUM ('STRIPE', 'ASAAS', 'MERCADO_PAGO', 'MANUAL');
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');
CREATE TYPE "BillingPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- Tabela de planos dinâmicos
CREATE TABLE "BillingPlan" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "tagline"     TEXT,
  "price"       DOUBLE PRECISION NOT NULL,
  "period"      "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
  "trialDays"   INTEGER NOT NULL DEFAULT 7,
  "status"      "BillingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "isPopular"   BOOLEAN NOT NULL DEFAULT false,
  "badge"       TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "userLimit"   INTEGER NOT NULL DEFAULT 0,
  "features"    JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPlan_slug_key" ON "BillingPlan"("slug");
CREATE INDEX "BillingPlan_status_sortOrder_idx" ON "BillingPlan"("status", "sortOrder");
CREATE INDEX "BillingPlan_slug_idx" ON "BillingPlan"("slug");

-- Tabela de mapeamento gateway <-> plano
CREATE TABLE "BillingGatewayMapping" (
  "id"           TEXT NOT NULL,
  "planId"       TEXT NOT NULL,
  "gateway"      "BillingGateway" NOT NULL,
  "externalId"   TEXT NOT NULL,
  "externalData" JSONB,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingGatewayMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingGatewayMapping_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BillingGatewayMapping_planId_gateway_key" ON "BillingGatewayMapping"("planId", "gateway");
CREATE INDEX "BillingGatewayMapping_gateway_isActive_idx" ON "BillingGatewayMapping"("gateway", "isActive");

-- Adicionar billingPlanId na Subscription (opcional, para migração gradual)
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingPlanId" TEXT;
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_billingPlanId_fkey"
  FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Subscription_billingPlanId_idx" ON "Subscription"("billingPlanId");

-- Função para atualizar updatedAt automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_billingplan_updated_at
  BEFORE UPDATE ON "BillingPlan"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billinggatewaymapping_updated_at
  BEFORE UPDATE ON "BillingGatewayMapping"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: migrar planos existentes do SubscriptionPlan para BillingPlan
-- e criar os mapeamentos de gateway correspondentes

-- Gratuito
INSERT INTO "BillingPlan" ("id", "slug", "name", "description", "tagline", "price", "trialDays", "isPopular", "sortOrder", "userLimit", "features")
VALUES (
  gen_random_uuid()::text, 'free', 'Gratuito', 'Para conhecer a plataforma', 'Comece gratuitamente',
  0, 0, false, 0, 10,
  '{"professor": false, "multitracks": 0, "splits": 0, "audio_upload": false}'
);

-- Básico
INSERT INTO "BillingPlan" ("id", "slug", "name", "description", "tagline", "price", "trialDays", "isPopular", "sortOrder", "userLimit", "features")
VALUES (
  gen_random_uuid()::text, 'basico', 'Básico', 'Ideal para ministérios pequenos', 'Para ministérios que querem crescer',
  29.90, 7, false, 1, 15,
  '{"professor": true, "multitracks": 0, "splits": 0, "audio_upload": true}'
);

-- Intermediário
INSERT INTO "BillingPlan" ("id", "slug", "name", "description", "tagline", "price", "trialDays", "isPopular", "sortOrder", "userLimit", "features")
VALUES (
  gen_random_uuid()::text, 'intermediario', 'Intermediário', 'Para ministérios em crescimento', 'O mais escolhido',
  49.90, 7, true, 2, 30,
  '{"professor": true, "multitracks": 3, "splits": 0, "audio_upload": true}'
);

-- Avançado
INSERT INTO "BillingPlan" ("id", "slug", "name", "description", "tagline", "price", "trialDays", "isPopular", "sortOrder", "userLimit", "features")
VALUES (
  gen_random_uuid()::text, 'avancado', 'Avançado', 'Para grandes ministérios', 'Para igrejas em crescimento',
  99.90, 7, false, 3, 100,
  '{"professor": true, "multitracks": 5, "splits": 3, "audio_upload": true}'
);

-- Enterprise
INSERT INTO "BillingPlan" ("id", "slug", "name", "description", "tagline", "price", "trialDays", "isPopular", "sortOrder", "userLimit", "features")
VALUES (
  gen_random_uuid()::text, 'enterprise', 'Enterprise', 'Para igrejas com múltiplos ministérios', 'Solução completa para igrejas',
  149.90, 7, false, 4, 0,
  '{"professor": true, "multitracks": 10, "splits": 10, "audio_upload": true}'
);

-- Mapeamentos Stripe para os planos (usando os price_ids já existentes no banco)
INSERT INTO "BillingGatewayMapping" ("id", "planId", "gateway", "externalId")
SELECT gen_random_uuid()::text, bp.id, 'STRIPE'::"BillingGateway", sp."stripePriceId"
FROM "BillingPlan" bp
JOIN "SubscriptionPlan" sp ON LOWER(sp.name) = LOWER(bp.name)
WHERE sp."stripePriceId" != 'free_plan';

-- Mapeamento manual para o plano gratuito
INSERT INTO "BillingGatewayMapping" ("id", "planId", "gateway", "externalId", "externalData")
SELECT gen_random_uuid()::text, bp.id, 'MANUAL'::"BillingGateway", 'free', '{"isFree": true}'::jsonb
FROM "BillingPlan" bp WHERE bp.slug = 'free';
