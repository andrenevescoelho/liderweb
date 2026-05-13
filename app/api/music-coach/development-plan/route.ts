export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const CRITERIA_LABELS: Record<string, string> = {
  afinacao: "Afinação",
  tecnicaVocal: "Técnica vocal",
  dominioInstrumental: "Domínio instrumental",
  conhecimentoMusical: "Conhecimento musical",
  pontualidade: "Pontualidade",
  comprometimento: "Comprometimento",
};

const PLAN_CACHE_KEY = "development_plan";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "1";

    // Buscar avaliação do líder
    const evalResult = await prisma.$queryRaw<any[]>`
      SELECT criteria, notes FROM "MemberEvaluation" WHERE "memberId" = ${user.id} LIMIT 1
    `;

    if (!evalResult?.length || !evalResult[0]?.criteria) {
      return NextResponse.json({ plan: null, message: "Nenhuma avaliação encontrada" });
    }

    const criteria = evalResult[0].criteria as Record<string, number>;
    const weakPoints = Object.entries(criteria).filter(([, v]) => v < 3).map(([k]) => k);
    const avgScore = Object.values(criteria).reduce((a, b) => a + b, 0) / Object.values(criteria).length;

    // Verificar cache
    if (!forceRefresh) {
      const groupId = (await prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } }))?.groupId;
      if (groupId) {
        const cached = await prisma.coachContentCache.findUnique({
          where: { userId_groupId_contentType: { userId: user.id, groupId, contentType: PLAN_CACHE_KEY } },
        });
        if (cached && new Date(cached.generatedAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000) {
          return NextResponse.json({ plan: cached.content, criteria, avgScore, weakPoints });
        }
      }
    }

    // Buscar perfil do membro
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        memberFunctions: {
          where: { isPending: false },
          include: { roleFunction: { select: { name: true } } },
        },
      },
    });

    const roles = profile?.memberFunctions?.map((mf: any) => mf.roleFunction.name) ?? [];
    const weakLabels = weakPoints.map(k => `${CRITERIA_LABELS[k]} (nota ${criteria[k]}/5)`);

    if (weakPoints.length === 0) {
      const plan = {
        summary: "Parabéns! Você está com notas altas em todos os critérios. Continue praticando para manter o nível!",
        tasks: [],
        motivational: "Continue assim! Sua dedicação está fazendo diferença no ministério. 🌟",
      };
      const groupId = (await prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } }))?.groupId;
      if (groupId) {
        await prisma.coachContentCache.upsert({
          where: { userId_groupId_contentType: { userId: user.id, groupId, contentType: PLAN_CACHE_KEY } },
          create: { userId: user.id, groupId, contentType: PLAN_CACHE_KEY, content: JSON.stringify(plan) },
          update: { content: JSON.stringify(plan), generatedAt: new Date() },
        });
      }
      return NextResponse.json({ plan: JSON.stringify(plan), criteria, avgScore, weakPoints });
    }

    // Gerar plano com IA
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "IA não configurada" }, { status: 500 });

    const prompt = `Você é um professor de música especializado em ministério de louvor evangélico brasileiro.

Um membro do ministério recebeu a seguinte avaliação do seu líder:
- Funções: ${roles.join(", ") || "não definidas"}
- Média geral: ${avgScore.toFixed(1)}/5
- Pontos que precisam de desenvolvimento: ${weakLabels.join(", ")}

Crie um plano de desenvolvimento PRÁTICO e MOTIVADOR. Máximo de 4 tarefas no total.
Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois:
{
  "summary": "Resumo motivador em 1 frase",
  "tasks": [
    {
      "id": "task_1",
      "criteria": "nome_do_criterio",
      "title": "Título curto",
      "description": "Descrição em 1-2 frases",
      "duration": "Ex: 10 min/dia",
      "frequency": "Ex: 3x/semana",
      "difficulty": "facil",
      "xpReward": 50,
      "resources": ["recurso 1"]
    }
  ],
  "motivational": "Mensagem motivacional em 1 frase"
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 3000 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleanText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    // Salvar no cache
    const groupId = (await prisma.user.findUnique({ where: { id: user.id }, select: { groupId: true } }))?.groupId;
    if (groupId) {
      await prisma.coachContentCache.upsert({
        where: { userId_groupId_contentType: { userId: user.id, groupId, contentType: PLAN_CACHE_KEY } },
        create: { userId: user.id, groupId, contentType: PLAN_CACHE_KEY, content: cleanText },
        update: { content: cleanText, generatedAt: new Date() },
      });
    }

    return NextResponse.json({ plan: cleanText, criteria, avgScore, weakPoints });
  } catch (e) {
    console.error("Development plan error:", e);
    return NextResponse.json({ error: "Erro ao gerar plano" }, { status: 500 });
  }
}
