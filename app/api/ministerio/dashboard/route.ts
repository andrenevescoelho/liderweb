export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function canAccess(role: string) {
  return ["SUPERADMIN", "ADMIN", "LEADER"].includes(role);
}

const CRITERIA_LABELS: Record<string, string> = {
  afinacao: "Afinação",
  tecnicaVocal: "Técnica vocal",
  dominioInstrumental: "Domínio instrumental",
  conhecimentoMusical: "Conhecimento musical",
  pontualidade: "Pontualidade",
  comprometimento: "Comprometimento",
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!canAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    // ── Membros do grupo ────────────────────────────────────────────────────
    const members = await prisma.user.findMany({
      where: { groupId: user.groupId, role: { not: "SUPERADMIN" } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
          take: 2,
        },
      },
    });

    const memberIds = members.map(m => m.id);

    // ── Avaliações ──────────────────────────────────────────────────────────
    const evaluations = memberIds.length > 0
      ? await prisma.$queryRaw<any[]>`
          SELECT "memberId", criteria, "updatedAt"
          FROM "MemberEvaluation"
          WHERE "groupId" = ${user.groupId}
        `
      : [];

    const evalMap: Record<string, any> = {};
    for (const e of evaluations) evalMap[e.memberId] = e;

    // ── Check-ins emocionais (últimos 7 dias) ───────────────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const checkins = memberIds.length > 0
      ? await prisma.$queryRaw<any[]>`
          SELECT "memberId", mood, "privacyLevel", "requestedCare", "requestedPrayer", "createdAt"
          FROM "EmotionalCheckin"
          WHERE "groupId" = ${user.groupId}
          AND "createdAt" >= ${sevenDaysAgo}
          ORDER BY "createdAt" DESC
        `
      : [];

    // Último check-in por membro
    const lastCheckinMap: Record<string, any> = {};
    const checkinHistoryMap: Record<string, any[]> = {};
    for (const c of checkins) {
      if (!lastCheckinMap[c.memberId]) lastCheckinMap[c.memberId] = c;
      if (!checkinHistoryMap[c.memberId]) checkinHistoryMap[c.memberId] = [];
      checkinHistoryMap[c.memberId].push(c);
    }

    // Check-ins de hoje — incluindo pré-escala
    const todayCheckins = checkins.filter(c => new Date(c.createdAt) >= today);
    const preScaleCheckins = checkins.filter(c => c.scheduleId !== null && new Date(c.createdAt) >= today);
    const checkedInToday = new Set(todayCheckins.map(c => c.memberId));

    // ── Radar de atenção ────────────────────────────────────────────────────
    const attentionNeeded: any[] = [];
    for (const [memberId, history] of Object.entries(checkinHistoryMap)) {
      const member = members.find(m => m.id === memberId);
      if (!member) continue;

      // Verificar dias negativos consecutivos
      const sorted = history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      let consecutiveNeg = 0;
      for (const c of sorted) {
        if (["MUITO_MAL", "DESANIMADO"].includes(c.mood)) consecutiveNeg++;
        else break;
      }

      const requestedCare = history.some(c => c.requestedCare);

      if (consecutiveNeg >= 3 || requestedCare) {
        attentionNeeded.push({
          memberId,
          name: member.name,
          reason: requestedCare
            ? "Solicitou acompanhamento pastoral"
            : `Desanimado há ${consecutiveNeg} dias consecutivos`,
          consecutiveNeg,
          requestedCare,
          lastMood: sorted[0]?.mood,
        });
      }
    }

    // ── Montar dados dos membros ────────────────────────────────────────────
    const membersData = members.map(m => {
      const eval_ = evalMap[m.id];
      const criteria = eval_?.criteria as Record<string, number> | null ?? null;
      const avgScore = criteria
        ? Object.values(criteria).reduce((a, b) => a + b, 0) / Object.values(criteria).length
        : null;
      const level = avgScore !== null
        ? avgScore >= 4.5 ? 5 : avgScore >= 4.0 ? 4 : avgScore >= 3.0 ? 3 : avgScore >= 2.0 ? 2 : 1
        : null;
      const levelLabel = level === 5 ? "Especialista" : level === 4 ? "Avançado" : level === 3 ? "Intermediário" : level === 2 ? "Em desenvolvimento" : level === 1 ? "Iniciante" : null;

      const lastCheckin = lastCheckinMap[m.id] ?? null;
      const history = checkinHistoryMap[m.id] ?? [];
      const needsAttention = attentionNeeded.some(a => a.memberId === m.id);

      return {
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        role: m.role,
        functions: m.memberFunctions.map((mf: any) => mf.roleFunction.name),
        // Desenvolvimento
        evaluation: criteria,
        avgScore,
        level,
        levelLabel,
        lastEvaluatedAt: eval_?.updatedAt ?? null,
        // Saúde
        lastMood: lastCheckin?.mood ?? null,
        checkedInToday: checkedInToday.has(m.id),
        moodHistory: history.slice(0, 7).map((c: any) => c.mood),
        needsAttention,
      };
    });

    // ── Médias do grupo ─────────────────────────────────────────────────────
    const evaluatedMembers = membersData.filter(m => m.evaluation);
    const groupCriteriaAvg: Record<string, number> = {};
    if (evaluatedMembers.length > 0) {
      for (const key of Object.keys(CRITERIA_LABELS)) {
        const vals = evaluatedMembers
          .map(m => (m.evaluation as any)?.[key])
          .filter((v): v is number => typeof v === "number");
        if (vals.length > 0) {
          groupCriteriaAvg[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }
    }

    // ── Saúde emocional do grupo ────────────────────────────────────────────
    const moodCounts = { MUITO_MAL: 0, DESANIMADO: 0, NEUTRO: 0, BEM: 0, MOTIVADO: 0 };
    for (const c of todayCheckins) {
      if (c.mood in moodCounts) moodCounts[c.mood as keyof typeof moodCounts]++;
    }
    const totalCheckins = todayCheckins.length;
    const positiveCount = moodCounts.BEM + moodCounts.MOTIVADO;
    const positivePercent = totalCheckins > 0 ? Math.round((positiveCount / totalCheckins) * 100) : null;

    return NextResponse.json({
      members: membersData,
      groupCriteriaAvg,
      criteriaLabels: CRITERIA_LABELS,
      attentionNeeded,
      moodSummary: {
        counts: moodCounts,
        total: totalCheckins,
        positivePercent,
        checkedInToday: checkedInToday.size,
        totalMembers: members.length,
        preScaleResponses: preScaleCheckins.length,
        preScalePositive: preScaleCheckins.filter(c => ["BEM", "MOTIVADO"].includes(c.mood)).length,
      },
      stats: {
        totalMembers: members.length,
        evaluatedCount: evaluatedMembers.length,
        avgGroupScore: evaluatedMembers.length > 0
          ? evaluatedMembers.reduce((a, m) => a + (m.avgScore ?? 0), 0) / evaluatedMembers.length
          : null,
        attentionCount: attentionNeeded.length,
        positivePercent,
      },
    });
  } catch (e) {
    console.error("Ministerio dashboard error:", e);
    return NextResponse.json({ error: "Erro ao carregar painel" }, { status: 500 });
  }
}
