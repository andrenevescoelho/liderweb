-- Preserva enum legado usada em MemberProfile.memberFunctions
ALTER TYPE "MemberFunction" RENAME TO "MemberFunctionLegacy";

-- Fonte única de funções (global ou por grupo)
CREATE TABLE "RoleFunction" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "groupId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoleFunction_pkey" PRIMARY KEY ("id")
);

-- Relação N:N entre membro (User) e função oficial
CREATE TABLE "MemberFunction" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roleFunctionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberFunction_pkey" PRIMARY KEY ("id")
);

-- Papéis oficiais de membros em escala
CREATE TABLE "ScaleMemberRole" (
  "id" TEXT NOT NULL,
  "scaleId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roleFunctionId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScaleMemberRole_pkey" PRIMARY KEY ("id")
);

-- Papéis oficiais de membros em ensaio
CREATE TABLE "RehearsalMemberRole" (
  "id" TEXT NOT NULL,
  "rehearsalId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "roleFunctionId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RehearsalMemberRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoleFunction_groupId_name_key" ON "RoleFunction"("groupId", "name");
CREATE INDEX "RoleFunction_groupId_idx" ON "RoleFunction"("groupId");

CREATE UNIQUE INDEX "MemberFunction_memberId_roleFunctionId_key" ON "MemberFunction"("memberId", "roleFunctionId");
CREATE INDEX "MemberFunction_roleFunctionId_idx" ON "MemberFunction"("roleFunctionId");

CREATE UNIQUE INDEX "ScaleMemberRole_scaleId_memberId_roleFunctionId_key" ON "ScaleMemberRole"("scaleId", "memberId", "roleFunctionId");
CREATE INDEX "ScaleMemberRole_scaleId_roleFunctionId_idx" ON "ScaleMemberRole"("scaleId", "roleFunctionId");
CREATE INDEX "ScaleMemberRole_memberId_roleFunctionId_idx" ON "ScaleMemberRole"("memberId", "roleFunctionId");

CREATE UNIQUE INDEX "RehearsalMemberRole_rehearsalId_memberId_roleFunctionId_key" ON "RehearsalMemberRole"("rehearsalId", "memberId", "roleFunctionId");
CREATE INDEX "RehearsalMemberRole_rehearsalId_roleFunctionId_idx" ON "RehearsalMemberRole"("rehearsalId", "roleFunctionId");
CREATE INDEX "RehearsalMemberRole_memberId_roleFunctionId_idx" ON "RehearsalMemberRole"("memberId", "roleFunctionId");

ALTER TABLE "RoleFunction"
  ADD CONSTRAINT "RoleFunction_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberFunction"
  ADD CONSTRAINT "MemberFunction_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MemberFunction_roleFunctionId_fkey"
  FOREIGN KEY ("roleFunctionId") REFERENCES "RoleFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScaleMemberRole"
  ADD CONSTRAINT "ScaleMemberRole_scaleId_fkey"
  FOREIGN KEY ("scaleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ScaleMemberRole_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ScaleMemberRole_roleFunctionId_fkey"
  FOREIGN KEY ("roleFunctionId") REFERENCES "RoleFunction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RehearsalMemberRole"
  ADD CONSTRAINT "RehearsalMemberRole_rehearsalId_fkey"
  FOREIGN KEY ("rehearsalId") REFERENCES "Rehearsal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RehearsalMemberRole_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RehearsalMemberRole_roleFunctionId_fkey"
  FOREIGN KEY ("roleFunctionId") REFERENCES "RoleFunction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
