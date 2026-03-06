-- Migração segura para preservar dados de MemberProfile.memberFunctions
-- durante o drop/recreate da coluna.

ALTER TABLE "MemberProfile"
  ADD COLUMN "memberFunctions_backup" TEXT[];

UPDATE "MemberProfile"
SET "memberFunctions_backup" = "memberFunctions"::TEXT[];

ALTER TABLE "MemberProfile"
  DROP COLUMN "memberFunctions";

ALTER TABLE "MemberProfile"
  ADD COLUMN "memberFunctions" "MemberFunctionLegacy"[] NOT NULL DEFAULT ARRAY[]::"MemberFunctionLegacy"[];

UPDATE "MemberProfile"
SET "memberFunctions" = COALESCE(
  (
    SELECT array_agg("value"::"MemberFunctionLegacy")
    FROM unnest("memberFunctions_backup") AS "value"
  ),
  ARRAY[]::"MemberFunctionLegacy"[]
)
WHERE "memberFunctions_backup" IS NOT NULL;

ALTER TABLE "MemberProfile"
  DROP COLUMN "memberFunctions_backup";
