-- Migration: add_faq_module
-- Cria categorias e itens de FAQ

CREATE TABLE "FaqCategory" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaqCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaqItem" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "order" INTEGER NOT NULL DEFAULT 0,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaqCategory_slug_key" ON "FaqCategory"("slug");
CREATE UNIQUE INDEX "FaqItem_categoryId_question_key" ON "FaqItem"("categoryId", "question");
CREATE INDEX "FaqItem_categoryId_order_idx" ON "FaqItem"("categoryId", "order");
CREATE INDEX "FaqItem_isPublished_idx" ON "FaqItem"("isPublished");

ALTER TABLE "FaqItem"
  ADD CONSTRAINT "FaqItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "FaqCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
