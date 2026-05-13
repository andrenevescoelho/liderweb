-- Criar tabela de avaliações de membros
CREATE TABLE IF NOT EXISTS "MemberEvaluation" (
  "id"          TEXT NOT NULL,
  "memberId"    TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL,
  "groupId"     TEXT NOT NULL,
  "criteria"    JSONB NOT NULL DEFAULT '{}',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemberEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemberEvaluation_memberId_groupId_key" UNIQUE ("memberId", "groupId"),
  CONSTRAINT "MemberEvaluation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "MemberEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "MemberEvaluation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MemberEvaluation_memberId_idx" ON "MemberEvaluation"("memberId");
CREATE INDEX IF NOT EXISTS "MemberEvaluation_groupId_idx" ON "MemberEvaluation"("groupId");
