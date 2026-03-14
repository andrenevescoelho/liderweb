-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'IMPORT';

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('MEMBERS', 'SONGS');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('VALIDATE_ONLY', 'CREATE_ONLY', 'CREATE_OR_UPDATE');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('VALIDATED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "importType" "ImportType" NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "ignoredRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'VALIDATED',
    "summary" TEXT,
    "detailsJson" JSONB,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_groupId_createdAt_idx" ON "ImportJob"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_importType_createdAt_idx" ON "ImportJob"("importType", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
