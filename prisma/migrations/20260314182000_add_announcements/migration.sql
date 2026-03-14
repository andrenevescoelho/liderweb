-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('INFO', 'FEATURE', 'PROMOTION', 'ALERT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnnouncementTargetScope" AS ENUM ('ALL_PLATFORM', 'SELECTED_GROUPS');

-- CreateEnum
CREATE TYPE "AnnouncementTargetAudience" AS ENUM ('ADMINS_ONLY', 'ALL_USERS');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "targetScope" "AnnouncementTargetScope" NOT NULL DEFAULT 'ALL_PLATFORM',
    "targetAudience" "AnnouncementTargetAudience" NOT NULL DEFAULT 'ALL_USERS',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementGroup" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementReceipt" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_status_isActive_idx" ON "Announcement"("status", "isActive");
CREATE INDEX "Announcement_startsAt_expiresAt_idx" ON "Announcement"("startsAt", "expiresAt");
CREATE INDEX "Announcement_targetScope_targetAudience_idx" ON "Announcement"("targetScope", "targetAudience");
CREATE INDEX "Announcement_priority_createdAt_idx" ON "Announcement"("priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementGroup_announcementId_groupId_key" ON "AnnouncementGroup"("announcementId", "groupId");
CREATE INDEX "AnnouncementGroup_groupId_idx" ON "AnnouncementGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementReceipt_announcementId_userId_key" ON "AnnouncementReceipt"("announcementId", "userId");
CREATE INDEX "AnnouncementReceipt_userId_viewedAt_idx" ON "AnnouncementReceipt"("userId", "viewedAt");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnouncementGroup" ADD CONSTRAINT "AnnouncementGroup_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementGroup" ADD CONSTRAINT "AnnouncementGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnouncementReceipt" ADD CONSTRAINT "AnnouncementReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
