-- ============================================================
-- Migration: Replace Professor (Codex) with Music Coach (Abacus)
-- ============================================================

-- 1. Remover tabelas antigas do Codex (ordem respeitando FK)
DROP TABLE IF EXISTS "PracticeFeedback" CASCADE;
DROP TABLE IF EXISTS "PracticeSubmission" CASCADE;
DROP TABLE IF EXISTS "ProgressHistory" CASCADE;
DROP TABLE IF EXISTS "ProfessorContent" CASCADE;
DROP TABLE IF EXISTS "ProfessorAccess" CASCADE;
DROP TABLE IF EXISTS "MusicCoachProfile" CASCADE;
DROP TABLE IF EXISTS "ProfessorModuleSettings" CASCADE;

-- 2. Remover enums exclusivos do Codex
DROP TYPE IF EXISTS "ProfessorRoleType";
DROP TYPE IF EXISTS "ProfessorAccessMode";
DROP TYPE IF EXISTS "PracticeType";
DROP TYPE IF EXISTS "PracticeSubmissionStatus";

-- 3. Remover valor PROFESSOR do enum AuditEntityType (não é possível diretamente no PG,
--    mas COACH já existe e é o valor correto a usar daqui em diante)

-- 4. Criar tabelas do Abacus

-- CoachContentCache
CREATE TABLE "CoachContentCache" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "groupId"     TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachContentCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachContentCache_userId_groupId_contentType_key"
    ON "CoachContentCache"("userId", "groupId", "contentType");

CREATE INDEX "CoachContentCache_userId_groupId_generatedAt_idx"
    ON "CoachContentCache"("userId", "groupId", "generatedAt");

-- MusicCoachProfile
CREATE TABLE "MusicCoachProfile" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "level"     INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MusicCoachProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MusicCoachProfile_userId_groupId_key"
    ON "MusicCoachProfile"("userId", "groupId");

CREATE INDEX "MusicCoachProfile_groupId_enabled_idx"
    ON "MusicCoachProfile"("groupId", "enabled");

-- PracticeSubmission
CREATE TABLE "PracticeSubmission" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "groupId"    TEXT NOT NULL,
    "audioUrl"   TEXT,
    "type"       TEXT NOT NULL,
    "instrument" TEXT,
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PracticeSubmission_userId_createdAt_idx"
    ON "PracticeSubmission"("userId", "createdAt");

CREATE INDEX "PracticeSubmission_groupId_createdAt_idx"
    ON "PracticeSubmission"("groupId", "createdAt");

-- PracticeFeedback
CREATE TABLE "PracticeFeedback" (
    "id"           TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "score"        INTEGER,
    "feedback"     TEXT,
    "suggestions"  TEXT,
    "metricsJson"  JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PracticeFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeFeedback_submissionId_key"
    ON "PracticeFeedback"("submissionId");

-- ProgressHistory
CREATE TABLE "ProgressHistory" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "groupId"    TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "value"      DOUBLE PRECISION NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgressHistory_userId_metricType_createdAt_idx"
    ON "ProgressHistory"("userId", "metricType", "createdAt");

CREATE INDEX "ProgressHistory_groupId_createdAt_idx"
    ON "ProgressHistory"("groupId", "createdAt");

-- 5. Foreign Keys

ALTER TABLE "CoachContentCache"
    ADD CONSTRAINT "CoachContentCache_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachContentCache"
    ADD CONSTRAINT "CoachContentCache_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicCoachProfile"
    ADD CONSTRAINT "MusicCoachProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MusicCoachProfile"
    ADD CONSTRAINT "MusicCoachProfile_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeSubmission"
    ADD CONSTRAINT "PracticeSubmission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeSubmission"
    ADD CONSTRAINT "PracticeSubmission_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeFeedback"
    ADD CONSTRAINT "PracticeFeedback_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "PracticeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgressHistory"
    ADD CONSTRAINT "ProgressHistory_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgressHistory"
    ADD CONSTRAINT "ProgressHistory_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
