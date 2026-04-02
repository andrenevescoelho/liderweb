export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

const SIMILARITY_THRESHOLD = 0.3;

// Busca no FAQ por similaridade de texto e tags
async function searchFAQ(question: string): Promise<{ item: any; score: number } | null> {
  const words = question
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length === 0) return null;

  // Full-text search no PostgreSQL
  const searchTerm = words.join(" | ");

  const items = await prisma.faqItem.findMany({
    where: {
      isPublished: true,
      category: { isActive: true },
      OR: [
        { question: { contains: question, mode: "insensitive" } },
        { answer: { contains: question, mode: "insensitive" } },
        { tags: { hasSome: words } },
        ...words.map(w => ({ question: { contains: w, mode: "insensitive" as const } })),
      ],
    },
    include: { category: { select: { name: true, slug: true } } },
    take: 5,
  });

  if (items.length === 0) return null;

  // Calcular score de relevância
  const scored = items.map(item => {
    let score = 0;
    const q = item.question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const a = item.answer.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const questionLower = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Correspondência exata na pergunta
    if (q.includes(questionLower) || questionLower.includes(q)) score += 0.8;

    // Palavras que coincidem
    words.forEach(w => {
      if (q.includes(w)) score += 0.2;
      if (a.includes(w)) score += 0.1;
      if (item.tags.includes(w)) score += 0.3;
    });

    return { item, score: Math.min(score, 1) };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  return best.score >= SIMILARITY_THRESHOLD ? best : null;
}

// Sugestões de ação baseadas no contexto
function getSuggestions(category: string, question: string): { label: string; href: string }[] {
  const slug = category?.toLowerCase() || "";
  const q = question.toLowerCase();

  if (slug.includes("escalas") || q.includes("escala")) return [{ label: "Ver Escalas", href: "/schedules" }];
  if (slug.includes("ensaios") || q.includes("ensaio")) return [{ label: "Ver Ensaios", href: "/rehearsals" }];
  if (slug.includes("multitrack") || q.includes("multitrack")) return [{ label: "Ver Multitracks", href: "/multitracks" }];
  if (slug.includes("custom-mix") || q.includes("custom mix") || q.includes("mix")) return [{ label: "Custom Mix", href: "/custom-mix" }];
  if (slug.includes("planos") || q.includes("plano") || q.includes("assinatura")) return [{ label: "Ver Planos", href: "/planos" }];
  if (slug.includes("professor") || q.includes("professor") || q.includes("ia")) return [{ label: "Professor IA", href: "/professor" }];
  if (slug.includes("pads") || q.includes("pad")) return [{ label: "Pads & Loops", href: "/pads" }];
  if (q.includes("membro") || q.includes("equipe")) return [{ label: "Ver Membros", href: "/members" }];
  return [];
}

// Chamar Gemini como fallback
async function callLLM(question: string, faqContext?: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Você é o assistente de suporte da plataforma Liderweb, um sistema SaaS para ministérios de louvor cristão.

A plataforma inclui: Escalas, Músicas, Ensaios, Multitracks, Custom Mix, Pads & Loops, Professor IA, Chat, Comunicados e Analytics.

${faqContext ? `CONTEXTO DO FAQ (use como base principal):\n${faqContext}\n\n` : ""}

REGRAS:
- Responda APENAS sobre a plataforma Liderweb
- Se não souber, diga honestamente e sugira abrir um ticket
- Seja objetivo, amigável e em português brasileiro
- Máximo 3 parágrafos

PERGUNTA DO USUÁRIO: ${question}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });

    // 1. Buscar no FAQ
    const faqResult = await searchFAQ(message);

    let answer: string;
    let source: "faq" | "llm" | "fallback";
    let faqItemId: string | undefined;
    let suggestions: { label: string; href: string }[] = [];
    let relatedItems: any[] = [];

    if (faqResult && faqResult.score >= SIMILARITY_THRESHOLD) {
      // Resposta encontrada no FAQ
      const item = faqResult.item;
      answer = item.answer;
      source = "faq";
      faqItemId = item.id;
      suggestions = getSuggestions(item.category?.slug ?? "", message);

      // Buscar perguntas relacionadas
      relatedItems = await prisma.faqItem.findMany({
        where: {
          categoryId: item.categoryId,
          isPublished: true,
          id: { not: item.id },
        },
        select: { id: true, question: true },
        take: 3,
      });
    } else {
      // FAQ não encontrou — tentar LLM com contexto parcial
      const partialContext = faqResult
        ? `Pergunta relacionada: "${faqResult.item.question}"\nResposta: "${faqResult.item.answer}"`
        : undefined;

      const llmAnswer = await callLLM(message, partialContext);

      if (llmAnswer) {
        answer = llmAnswer;
        source = "llm";
      } else {
        answer = "Não encontrei uma resposta específica para essa dúvida no nosso FAQ. Você pode abrir um chamado de suporte e nossa equipe responderá em breve.";
        source = "fallback";
      }
    }

    // Salvar log
    await (prisma as any).supportChatLog.create({
      data: {
        groupId: user.groupId ?? null,
        userId: user.id,
        question: message,
        answer,
        source,
        faqItemId: faqItemId ?? null,
      },
    });

    return NextResponse.json({
      answer,
      source,
      faqItem: faqResult ? { id: faqResult.item.id, question: faqResult.item.question, category: faqResult.item.category?.name } : null,
      suggestions,
      relatedItems,
      canOpenTicket: source === "fallback" || source === "llm",
    });
  } catch (error: any) {
    console.error("[support/chat]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
