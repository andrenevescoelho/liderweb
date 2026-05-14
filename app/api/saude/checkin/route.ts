export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const MOOD_LABELS: Record<string, string> = {
  MUITO_MAL: "Muito mal",
  DESANIMADO: "Desanimado",
  NEUTRO: "Neutro",
  BEM: "Bem",
  MOTIVADO: "Motivado",
};

const MOOD_VERSES: Record<string, { verse: string; reference: string; message: string }> = {
  MUITO_MAL: {
    verse: "Lança sobre o Senhor o teu peso, e ele te sustentará.",
    reference: "Salmos 55:22",
    message: "Você não precisa carregar isso sozinho. Deus está com você neste momento difícil. 🙏",
  },
  DESANIMADO: {
    verse: "Não te cansas, não te fatigues, porque o Senhor teu Deus está contigo.",
    reference: "Josué 1:9",
    message: "O desânimo passa, mas a presença de Deus é permanente. Você é valorizado! ❤️",
  },
  NEUTRO: {
    verse: "Entrega o teu caminho ao Senhor; confia nele, e ele tudo fará.",
    reference: "Salmos 37:5",
    message: "Dias neutros também fazem parte da jornada. Continue firme! 🌟",
  },
  BEM: {
    verse: "O Senhor é a minha força e o meu escudo; nele confiou o meu coração.",
    reference: "Salmos 28:7",
    message: "Que bom saber que você está bem! Continue sendo luz no ministério! ☀️",
  },
  MOTIVADO: {
    verse: "Tudo posso naquele que me fortalece.",
    reference: "Filipenses 4:13",
    message: "Que motivação contagiante! O ministério precisa dessa energia! 🔥",
  },
};

// GET — buscar último check-in e status do dia
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCheckin = await prisma.$queryRaw<any[]>`
      SELECT * FROM "EmotionalCheckin"
      WHERE "memberId" = ${user.id}
      AND "createdAt" >= ${today}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    const recentCheckins = await prisma.$queryRaw<any[]>`
      SELECT mood, "createdAt" FROM "EmotionalCheckin"
      WHERE "memberId" = ${user.id}
      ORDER BY "createdAt" DESC
      LIMIT 7
    `;

    return NextResponse.json({
      todayCheckin: todayCheckin?.[0] ?? null,
      recentCheckins,
      hasCheckedInToday: todayCheckin.length > 0,
    });
  } catch (e) {
    console.error("Get checkin error:", e);
    return NextResponse.json({ error: "Erro ao buscar check-in" }, { status: 500 });
  }
}

// POST — registrar check-in
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!user?.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { mood, note, privacyLevel, requestedPrayer, requestedCare, scheduleId } = await req.json();

    const validMoods = ["MUITO_MAL", "DESANIMADO", "NEUTRO", "BEM", "MOTIVADO"];
    if (!validMoods.includes(mood)) {
      return NextResponse.json({ error: "Humor inválido" }, { status: 400 });
    }

    const id = `checkin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const privacy = privacyLevel ?? "LEADER_ONLY";

    await prisma.$executeRaw`
      INSERT INTO "EmotionalCheckin" (id, "memberId", "groupId", mood, note, "privacyLevel", "requestedPrayer", "requestedCare", "scheduleId", "createdAt")
      VALUES (${id}, ${user.id}, ${user.groupId}, ${mood}::"MoodLevel", ${note ?? null}, ${privacy}::"PrivacyLevel", ${requestedPrayer ?? false}, ${requestedCare ?? false}, ${scheduleId ?? null}, NOW())
    `;

    // Notificar líder se solicitou cuidado ou está muito mal
    if (requestedCare || mood === "MUITO_MAL") {
      const leaders = await prisma.user.findMany({
        where: { groupId: user.groupId, role: { in: ["ADMIN", "LEADER"] }, id: { not: user.id } },
        select: { id: true, name: true },
      });

      if (leaders.length > 0 && privacy !== "PRIVATE") {
        const memberName = privacy === "ANONYMOUS" ? "Um membro" : (user.name ?? "Um membro");
        const { sendPushToMany, getPushTokensForUsers } = await import("@/lib/push-notifications");
        const leaderIds = leaders.map((l) => l.id);
        const tokens = await getPushTokensForUsers(leaderIds);
        if (tokens.length > 0) {
          await sendPushToMany(tokens, {
            title: "💙 Atenção pastoral necessária",
            body: requestedCare
              ? `${memberName} solicitou acompanhamento pastoral.`
              : `${memberName} está passando por um momento difícil.`,
            data: { url: "/saude", type: "pastoral_care" },
          });
        }
      }
    }

    // Verificar padrão de desânimo (3+ dias)
    const recentNegative = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count FROM "EmotionalCheckin"
      WHERE "memberId" = ${user.id}
      AND mood IN ('MUITO_MAL', 'DESANIMADO')
      AND "createdAt" >= NOW() - INTERVAL '7 days'
    `;
    const negativeCount = parseInt(recentNegative?.[0]?.count ?? 0);

    if (negativeCount >= 3 && privacy !== "PRIVATE") {
      const leaders = await prisma.user.findMany({
        where: { groupId: user.groupId, role: { in: ["ADMIN", "LEADER"] }, id: { not: user.id } },
        select: { id: true },
      });
      if (leaders.length > 0) {
        const memberName = privacy === "ANONYMOUS" ? "Um membro" : (user.name ?? "Um membro");
        const { sendPushToMany, getPushTokensForUsers } = await import("@/lib/push-notifications");
        const tokens = await getPushTokensForUsers(leaders.map((l) => l.id));
        if (tokens.length > 0) {
          await sendPushToMany(tokens, {
            title: "🙏 Radar de atenção",
            body: `${memberName} demonstrou sinais de desânimo nos últimos dias. Talvez seja um bom momento para um acompanhamento.`,
            data: { url: "/saude", type: "attention_radar" },
          });
        }
      }
    }

    const encouragement = MOOD_VERSES[mood];

    return NextResponse.json({
      success: true,
      encouragement,
      moodLabel: MOOD_LABELS[mood],
    });
  } catch (e) {
    console.error("Checkin error:", e);
    return NextResponse.json({ error: "Erro ao registrar check-in" }, { status: 500 });
  }
}
