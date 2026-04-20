CREATE TABLE IF NOT EXISTS "EmailConfig" (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT
);
CREATE INDEX IF NOT EXISTS "EmailConfig_category_idx" ON "EmailConfig"(category);
