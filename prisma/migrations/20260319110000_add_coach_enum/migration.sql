DO $$
BEGIN
  ALTER TYPE "AuditEntityType" ADD VALUE 'COACH';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
