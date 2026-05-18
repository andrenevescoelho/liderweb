export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const FALLBACK_MESSAGES = [
  "Deus vê cada lágrima e cada luta sua. Ele não te abandonou. \"O Senhor é o meu pastor e nada me faltará.\" — Salmos 23:1\n\nVocê não está só nessa caminhada.",
  "Seu cansaço é real, mas o cuidado de Deus também é. \"Lança sobre o Senhor o teu peso, e ele te sustentará.\" — Salmos 55:22\n\nEsse momento vai passar e você vai sair mais forte.",
  "Deus conhece exatamente onde você está. \"Não temas, porque eu sou contigo.\" — Isaías 41:10\n\nContinue firme — o ministério precisa de você.",
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const checkins = await prisma.$queryRaw<any[]>`
      SELECT mood FROM "EmotionalCheckin"
      WHERE "memberId" = ${user.id}
      ORDER BY "createdAt" DESC
      LIMIT 7
    `;

    if (!checkins.length) return NextResponse.json({ message: null, reason: "sem_historico" });

    const lastMood = checkins[0]?.mood;
    if (!["MUITO_MAL", "DESANIMADO"].includes(lastMood)) {
      return NextResponse.json({ message: null, reason: "humor_positivo" });
    }

    const negativeStreak = checkins.filter(c => ["MUITO_MAL", "DESANIMADO"].includes(c.mood)).length;

    const memberProfile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
          take: 1,
        },
      },
    });

    const firstName = memberProfile?.name?.split(" ")[0] ?? "amigo";
    const role = memberProfile?.memberFunctions?.[0]?.roleFunction?.name ?? "integrante do ministério";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallback = FALLBACK_MESSAGES[negativeStreak % FALLBACK_MESSAGES.length];
      return NextResponse.json({ message: fallback, mood: lastMood, negativeStreak });
    }

    const prompt = `Escreva uma mensagem pastoral curta e completa para ${firstName}, que é ${role} num ministério de louvor e está desanimado há ${negativeStreak} dias.

REGRAS RÍGIDAS:
- Exatamente 3 partes separadas por linha em branco
- Parte 1: acolhimento (1 frase, máx 15 palavras)
- Parte 2: versículo completo entre aspas + referência (ex: "texto" — Livro X:Y)
- Parte 3: encorajamento final (1 frase, máx 15 palavras)
- NÃO use markdown, asteriscos, travessões no início, ou qualquer formatação
- Responda SOMENTE as 3 partes, nada mais`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        }),
      }
    );

    const data = await res.json();
    const message = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!message || message.startsWith("{")) {
      const fallback = FALLBACK_MESSAGES[negativeStreak % FALLBACK_MESSAGES.length];
      return NextResponse.json({ message: fallback, mood: lastMood, negativeStreak });
    }

    return NextResponse.json({ message, mood: lastMood, negativeStreak });
  } catch (e) {
    console.error("Encouragement error:", e);
    const fallback = FALLBACK_MESSAGES[0];
    return NextResponse.json({ message: fallback, mood: "DESANIMADO", negativeStreak: 1 });
  }
}
