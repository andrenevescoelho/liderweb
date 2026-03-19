-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'PROFESSOR';

-- CreateEnum
CREATE TYPE "ProfessorRoleType" AS ENUM ('MINISTER', 'SINGER', 'MUSICIAN');

-- CreateEnum
CREATE TYPE "ProfessorAccessMode" AS ENUM ('ALL_MEMBERS', 'SELECTED_MEMBERS');

-- CreateEnum
CREATE TYPE "PracticeType" AS ENUM ('VOCAL', 'INSTRUMENT', 'MINISTRATION');

-- CreateEnum
CREATE TYPE "PracticeSubmissionStatus" AS ENUM ('UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED');

-- CreateTable
CREATE TABLE "ProfessorModuleSettings" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accessMode" "ProfessorAccessMode" NOT NULL DEFAULT 'SELECTED_MEMBERS',
    "enabledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessorModuleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessorAccess" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessorAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicCoachProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "roleType" "ProfessorRoleType" NOT NULL,
    "instrument" TEXT,
    "level" "SkillLevel",
    "currentFocus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicCoachProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" "PracticeType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PracticeSubmissionStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeFeedback" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "score" INTEGER,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "improvements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedbackText" TEXT NOT NULL,
    "metricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessorContent" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetRole" "ProfessorRoleType",
    "targetInstrument" TEXT,
    "contentType" TEXT NOT NULL,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessorContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessorModuleSettings_groupId_key" ON "ProfessorModuleSettings"("groupId");
CREATE UNIQUE INDEX "ProfessorAccess_groupId_userId_key" ON "ProfessorAccess"("groupId", "userId");
CREATE INDEX "ProfessorAccess_groupId_enabled_idx" ON "ProfessorAccess"("groupId", "enabled");
CREATE UNIQUE INDEX "MusicCoachProfile_userId_key" ON "MusicCoachProfile"("userId");
CREATE INDEX "MusicCoachProfile_groupId_roleType_idx" ON "MusicCoachProfile"("groupId", "roleType");
CREATE INDEX "PracticeSubmission_groupId_userId_createdAt_idx" ON "PracticeSubmission"("groupId", "userId", "createdAt");
CREATE INDEX "PracticeSubmission_status_createdAt_idx" ON "PracticeSubmission"("status", "createdAt");
CREATE INDEX "PracticeFeedback_submissionId_createdAt_idx" ON "PracticeFeedback"("submissionId", "createdAt");
CREATE INDEX "ProgressHistory_groupId_userId_metricType_createdAt_idx" ON "ProgressHistory"("groupId", "userId", "metricType", "createdAt");
CREATE INDEX "ProfessorContent_groupId_isActive_createdAt_idx" ON "ProfessorContent"("groupId", "isActive", "createdAt");
CREATE INDEX "ProfessorContent_targetRole_targetInstrument_idx" ON "ProfessorContent"("targetRole", "targetInstrument");

-- AddForeignKey
ALTER TABLE "ProfessorModuleSettings" ADD CONSTRAINT "ProfessorModuleSettings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorAccess" ADD CONSTRAINT "ProfessorAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorAccess" ADD CONSTRAINT "ProfessorAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicCoachProfile" ADD CONSTRAINT "MusicCoachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicCoachProfile" ADD CONSTRAINT "MusicCoachProfile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSubmission" ADD CONSTRAINT "PracticeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSubmission" ADD CONSTRAINT "PracticeSubmission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeFeedback" ADD CONSTRAINT "PracticeFeedback_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PracticeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressHistory" ADD CONSTRAINT "ProgressHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressHistory" ADD CONSTRAINT "ProgressHistory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorContent" ADD CONSTRAINT "ProfessorContent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
