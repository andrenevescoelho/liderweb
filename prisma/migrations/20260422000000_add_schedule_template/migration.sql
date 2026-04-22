CREATE TABLE IF NOT EXISTS "ScheduleTemplate" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "groupId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "dayOfWeek"   INTEGER,
  "defaultTime" TEXT,
  "songCount"   INTEGER NOT NULL DEFAULT 5,
  "bandType"    TEXT NOT NULL DEFAULT 'full',
  "roles"       JSONB NOT NULL DEFAULT '[]',
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "ScheduleTemplate_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScheduleTemplate_groupId_idx" ON "ScheduleTemplate"("groupId");
