ALTER TABLE "ScheduleRole" 
  ADD COLUMN IF NOT EXISTS "declineReason" TEXT,
  ADD COLUMN IF NOT EXISTS "declineNote" TEXT;
