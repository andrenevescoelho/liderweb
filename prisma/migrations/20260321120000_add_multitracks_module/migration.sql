-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'MULTITRACK';

-- CreateEnum
CREATE TYPE "MultitracksAlbumStatus" AS ENUM ('PENDING', 'READY', 'ERROR');
CREATE TYPE "MultitracksRentalStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable MultitracksAlbum
CREATE TABLE "MultitracksAlbum" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "artist"      TEXT NOT NULL,
    "genre"       TEXT,
    "bpm"         INTEGER,
    "musicalKey"  TEXT,
    "coverUrl"    TEXT,
    "description" TEXT,
    "status"      "MultitracksAlbumStatus" NOT NULL DEFAULT 'PENDING',
    "stems"       JSONB NOT NULL DEFAULT '[]',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultitracksAlbum_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MultitracksAlbum_status_isActive_idx" ON "MultitracksAlbum"("status", "isActive");
CREATE INDEX "MultitracksAlbum_title_artist_idx" ON "MultitracksAlbum"("title", "artist");

-- CreateTable MultitracksRental
CREATE TABLE "MultitracksRental" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "albumId"   TEXT NOT NULL,
    "rentedBy"  TEXT NOT NULL,
    "r2Folder"  TEXT NOT NULL,
    "status"    "MultitracksRentalStatus" NOT NULL DEFAULT 'ACTIVE',
    "rentedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultitracksRental_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MultitracksRental_groupId_albumId_key" ON "MultitracksRental"("groupId", "albumId");
CREATE INDEX "MultitracksRental_groupId_status_idx" ON "MultitracksRental"("groupId", "status");
CREATE INDEX "MultitracksRental_albumId_idx" ON "MultitracksRental"("albumId");
CREATE INDEX "MultitracksRental_expiresAt_idx" ON "MultitracksRental"("expiresAt");

-- CreateTable MultitracksUsage
CREATE TABLE "MultitracksUsage" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "month"     INTEGER NOT NULL,
    "year"      INTEGER NOT NULL,
    "count"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultitracksUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MultitracksUsage_groupId_month_year_key" ON "MultitracksUsage"("groupId", "month", "year");
CREATE INDEX "MultitracksUsage_groupId_year_month_idx" ON "MultitracksUsage"("groupId", "year", "month");

-- Foreign Keys
ALTER TABLE "MultitracksRental" ADD CONSTRAINT "MultitracksRental_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MultitracksRental" ADD CONSTRAINT "MultitracksRental_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "MultitracksAlbum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MultitracksUsage" ADD CONSTRAINT "MultitracksUsage_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
