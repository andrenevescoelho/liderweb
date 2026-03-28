-- Migration: billing_v2_phase3
-- Adiciona BillingProduct, Cart, Order e itens relacionados

CREATE TYPE "ProductType" AS ENUM ('MULTITRACK_RENTAL', 'SPLIT_REQUEST', 'SPLIT_ACCESS', 'MODULE_ACCESS', 'ADDON');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "CartStatus" AS ENUM ('OPEN', 'CHECKOUT', 'COMPLETED', 'ABANDONED');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');

-- Produtos avulsos
CREATE TABLE "BillingProduct" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "type"        "ProductType" NOT NULL,
  "status"      "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "price"       DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'BRL',
  "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "imageUrl"    TEXT,
  "metadata"    JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingProduct_slug_key" ON "BillingProduct"("slug");
CREATE INDEX "BillingProduct_status_type_idx" ON "BillingProduct"("status", "type");

-- Mapeamento produto <-> gateway
CREATE TABLE "BillingProductGatewayMapping" (
  "id"         TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "gateway"    "BillingGateway" NOT NULL,
  "externalId" TEXT NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingProductGatewayMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingProductGatewayMapping_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "BillingProduct"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "BillingProductGatewayMapping_productId_gateway_key" ON "BillingProductGatewayMapping"("productId", "gateway");

-- Carrinho
CREATE TABLE "Cart" (
  "id"        TEXT NOT NULL,
  "groupId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "status"    "CartStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cart_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
);
CREATE INDEX "Cart_groupId_status_idx" ON "Cart"("groupId", "status");
CREATE INDEX "Cart_userId_status_idx" ON "Cart"("userId", "status");

-- Item do carrinho
CREATE TABLE "CartItem" (
  "id"        TEXT NOT NULL,
  "cartId"    TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "metadata"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CartItem_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE,
  CONSTRAINT "CartItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "BillingProduct"("id")
);
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

-- Pedido
CREATE TABLE "Order" (
  "id"          TEXT NOT NULL,
  "groupId"     TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "status"      "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "totalAmount" DOUBLE PRECISION NOT NULL,
  "currency"    TEXT NOT NULL DEFAULT 'BRL',
  "gateway"     "BillingGateway",
  "externalId"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
);
CREATE INDEX "Order_groupId_status_idx" ON "Order"("groupId", "status");
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");

-- Item do pedido
CREATE TABLE "OrderItem" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity"  INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "metadata"  JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE,
  CONSTRAINT "OrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "BillingProduct"("id")
);

-- Triggers de updatedAt
CREATE TRIGGER update_billingproduct_updated_at
  BEFORE UPDATE ON "BillingProduct"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_updated_at
  BEFORE UPDATE ON "Cart"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_updated_at
  BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: produtos avulsos iniciais
INSERT INTO "BillingProduct" ("id", "slug", "name", "description", "type", "price", "sortOrder", "metadata")
VALUES
  (gen_random_uuid()::text, 'multitrack-avulso', 'Multitrack Avulso', 'Aluguel de multitrack além da cota mensal do plano.', 'MULTITRACK_RENTAL', 9.90, 0, '{"durationDays": 30}'),
  (gen_random_uuid()::text, 'split-solicitacao', 'Split de Música', 'Solicite o split de uma música. Fica no acervo para reutilização.', 'SPLIT_REQUEST', 19.90, 1, '{}'),
  (gen_random_uuid()::text, 'split-acervo', 'Split do Acervo', 'Acesse um split já processado por outro ministério.', 'SPLIT_ACCESS', 4.90, 2, '{}');
