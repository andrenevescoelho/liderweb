-- CreateEnum
CREATE TYPE "MemberFunction" AS ENUM (
  'VOCAL',
  'TECLADO',
  'VIOLAO',
  'GUITARRA',
  'BAIXO',
  'BATERIA',
  'PERCUSSAO',
  'BACKING_VOCAL',
  'SOPRO',
  'MIDIA',
  'SOM',
  'LIDER',
  'OUTRO'
);

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "MemberProfile"
ADD COLUMN "availabilityNotes" TEXT,
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "memberFunctions" "MemberFunction"[] DEFAULT ARRAY[]::"MemberFunction"[],
ADD COLUMN "profileVoiceType" TEXT,
ADD COLUMN "repertoirePrefs" TEXT,
ADD COLUMN "skillLevel" "SkillLevel",
ADD COLUMN "state" TEXT,
ADD COLUMN "vocalRangeKey" TEXT,
ADD COLUMN "youtube" TEXT;
