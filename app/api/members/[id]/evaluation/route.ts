export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const CRITERIA_KEYS = [
  "afinacao", "tecnicaVocal", "dominioInstrumental",
  "conhecimentoMusical", "pontualidade", "comprometimento",
];

function canEvaluate(role: string) {
  return ["SUPERADMIN", "ADMIN", "LEADER"].includes(role);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id: memberId } = params;

    if (memberId !== user.id && !canEvaluate(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const result = await prisma.$queryRaw<any[]>`
      SELECT e.*, u.name as "evaluatorName"
      FROM "MemberEvaluation" e
      LEFT JOIN "User" u ON u.id = e."evaluatorId"
      WHERE e."memberId" = ${memberId}
      LIMIT 1
    `;

    return NextResponse.json(result?.[0] ?? null);
  } catch (e) {
    console.error("Get evaluation error:", e);
    return NextResponse.json({ error: "Erro ao buscar avaliação" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    if (!canEvaluate(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { id: memberId } = params;
    const body = await req.json();
    const { criteria, notes } = body;

    const validCriteria: Record<string, number> = {};
    for (const [key, val] of Object.entries(criteria ?? {})) {
      if (!CRITERIA_KEYS.includes(key)) continue;
      if (typeof val !== "number" || val < 1 || val > 5) {
        return NextResponse.json({ error: `Critério inválido: ${key}` }, { status: 400 });
      }
      validCriteria[key] = Math.round(val as number);
    }
    if (Object.keys(validCriteria).length === 0) {
      return NextResponse.json({ error: "Nenhum critério válido enviado" }, { status: 400 });
    }

    const member = await prisma.user.findUnique({
      where: { id: memberId },
      select: { groupId: true },
    });

    if (!member) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
    if (user.role !== "SUPERADMIN" && member.groupId !== user.groupId) {
      return NextResponse.json({ error: "Membro não está no seu grupo" }, { status: 403 });
    }

    const groupId = member.groupId!;
    const criteriaJson = JSON.stringify(validCriteria);
    const notesVal = notes ?? null;

    // Verificar se já existe
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM "MemberEvaluation" WHERE "memberId" = ${memberId} AND "groupId" = ${groupId} LIMIT 1
    `;

    let evaluation;
    if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE "MemberEvaluation"
        SET criteria = ${criteriaJson}::jsonb, notes = ${notesVal}, "evaluatorId" = ${user.id}, "updatedAt" = NOW()
        WHERE "memberId" = ${memberId} AND "groupId" = ${groupId}
      `;
    } else {
      const newId = `eval_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await prisma.$executeRaw`
        INSERT INTO "MemberEvaluation" (id, "memberId", "evaluatorId", "groupId", criteria, notes, "createdAt", "updatedAt")
        VALUES (${newId}, ${memberId}, ${user.id}, ${groupId}, ${criteriaJson}::jsonb, ${notesVal}, NOW(), NOW())
      `;
    }

    const result = await prisma.$queryRaw<any[]>`
      SELECT * FROM "MemberEvaluation" WHERE "memberId" = ${memberId} AND "groupId" = ${groupId} LIMIT 1
    `;

    // Sincronizar nível do Professor IA com base na média da avaliação
    const avg = Object.values(validCriteria).reduce((a, b) => a + b, 0) / Object.values(validCriteria).length;
    const newLevel = avg >= 4.5 ? 5 : avg >= 4.0 ? 4 : avg >= 3.0 ? 3 : avg >= 2.0 ? 2 : 1;
    await prisma.$executeRaw`
      UPDATE "MusicCoachProfile" SET level = ${newLevel}
      WHERE "userId" = ${memberId}
    `.catch(() => {});

    // Invalidar cache do Professor para forçar regeneração com novo nível
    await prisma.coachContentCache.deleteMany({
      where: { userId: memberId },
    }).catch(() => {}); // fail silently se não tiver perfil

    return NextResponse.json(result?.[0] ?? {});
  } catch (e) {
    console.error("Save evaluation error:", e);
    return NextResponse.json({ error: "Erro ao salvar avaliação" }, { status: 500 });
  }
}
