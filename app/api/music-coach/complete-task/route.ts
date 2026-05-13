export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// XP necessário para subir 0.5 estrela em um critério
const XP_PER_HALF_STAR = 200;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { taskId, criteria, xpReward } = await req.json();
    if (!taskId || !criteria) return NextResponse.json({ error: "taskId e criteria são obrigatórios" }, { status: 400 });

    const xp = Math.max(1, Math.min(500, parseInt(xpReward) || 50));

    // Verificar se já concluiu essa tarefa
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM "MemberTaskCompletion" WHERE "memberId" = ${user.id} AND "taskId" = ${taskId} LIMIT 1
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Tarefa já concluída", alreadyDone: true }, { status: 400 });
    }

    // Registrar conclusão
    const completionId = `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await prisma.$executeRaw`
      INSERT INTO "MemberTaskCompletion" (id, "memberId", "taskId", criteria, "xpEarned", "completedAt")
      VALUES (${completionId}, ${user.id}, ${taskId}, ${criteria}, ${xp}, NOW())
    `;

    // Calcular XP total neste critério
    const xpResult = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM("xpEarned"), 0) as total FROM "MemberTaskCompletion"
      WHERE "memberId" = ${user.id} AND criteria = ${criteria}
    `;
    const totalXp = parseInt(xpResult?.[0]?.total ?? 0);

    // Verificar se a nota deve subir
    const evalResult = await prisma.$queryRaw<any[]>`
      SELECT id, criteria, "groupId" FROM "MemberEvaluation" WHERE "memberId" = ${user.id} LIMIT 1
    `;

    let newScore = null;
    let leveledUp = false;

    if (evalResult.length > 0) {
      const evaluation = evalResult[0];
      const currentCriteria = evaluation.criteria as Record<string, number>;
      const currentScore = currentCriteria[criteria] ?? 1;

      // A cada XP_PER_HALF_STAR XP, sobe 0.5 estrela (máx 5)
      const starsToAdd = Math.floor(totalXp / XP_PER_HALF_STAR) * 0.5;
      const baseScore = Math.floor(currentScore); // nota base sem os incrementos de XP anteriores

      // Calcular nova nota com base no XP total acumulado
      const xpBonus = Math.min(Math.floor(totalXp / XP_PER_HALF_STAR) * 0.5, 5 - baseScore);
      const updatedScore = Math.min(5, baseScore + xpBonus);

      if (updatedScore > currentScore) {
        const updatedCriteria = { ...currentCriteria, [criteria]: updatedScore };
        await prisma.$executeRaw`
          UPDATE "MemberEvaluation"
          SET criteria = ${JSON.stringify(updatedCriteria)}::jsonb, "updatedAt" = NOW()
          WHERE id = ${evaluation.id}
        `;
        newScore = updatedScore;
        leveledUp = true;

        // Atualizar nível do Professor
        const allScores = Object.values(updatedCriteria) as number[];
        const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        const newLevel = avg >= 4.5 ? 5 : avg >= 4.0 ? 4 : avg >= 3.0 ? 3 : avg >= 2.0 ? 2 : 1;
        await prisma.$executeRaw`
          UPDATE "MusicCoachProfile" SET level = ${newLevel} WHERE "userId" = ${user.id}
        `.catch(() => {});

        // Invalidar cache do plano
        await prisma.$executeRaw`
          DELETE FROM "CoachContentCache" WHERE "userId" = ${user.id} AND "contentType" = 'development_plan'
        `.catch(() => {});
      }
    }

    // Calcular XP total geral
    const totalXpResult = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM("xpEarned"), 0) as total FROM "MemberTaskCompletion" WHERE "memberId" = ${user.id}
    `;
    const totalXpAll = parseInt(totalXpResult?.[0]?.total ?? 0);

    return NextResponse.json({
      success: true,
      xpEarned: xp,
      totalXp: totalXpAll,
      criteriaXp: totalXp,
      leveledUp,
      newScore,
      nextLevelXp: XP_PER_HALF_STAR - (totalXp % XP_PER_HALF_STAR),
    });
  } catch (e) {
    console.error("Complete task error:", e);
    return NextResponse.json({ error: "Erro ao concluir tarefa" }, { status: 500 });
  }
}

// GET — buscar XP total e tarefas concluídas
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const completions = await prisma.$queryRaw<any[]>`
      SELECT "taskId", criteria, "xpEarned", "completedAt"
      FROM "MemberTaskCompletion" WHERE "memberId" = ${user.id}
    `;

    const totalXp = completions.reduce((a, c) => a + (c.xpEarned ?? 0), 0);
    const completedTaskIds = completions.map(c => c.taskId);
    const xpByCriteria = completions.reduce((acc: Record<string, number>, c) => {
      acc[c.criteria] = (acc[c.criteria] ?? 0) + c.xpEarned;
      return acc;
    }, {});

    return NextResponse.json({ totalXp, completedTaskIds, xpByCriteria });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao buscar XP" }, { status: 500 });
  }
}
