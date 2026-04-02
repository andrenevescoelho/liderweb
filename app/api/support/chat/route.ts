export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

const SIMILARITY_THRESHOLD = 0.4;

// Busca no FAQ por similaridade de texto e tags
async function searchFAQ(question: string): Promise<{ item: any; score: number } | null> {
  const STOPWORDS = new Set(["com", "que", "minha", "meu", "para", "uma", "como", "por", "dos", "das", "nos", "nas", "esta", "isso", "nao", "nao", "sim", "ter", "tem", "ser", "foi", "meus", "suas", "seu", "sua", "este", "essa", "esses", "essas", "muito", "mais", "mas", "quando", "onde", "qual", "quais", "quem", "cujo", "ainda", "pois", "esta", "estou", "estao", "problema", "problemas", "ajuda"]);
  const words = question
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

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

  const systemContext = `Você é o assistente de suporte da plataforma Liderweb.

SOBRE A PLATAFORMA:
- Liderweb é um SaaS para ministérios de louvor cristão
- Módulos: Escalas, Músicas/Cifras, Ensaios, Multitracks, Custom Mix, Pads & Loops, Professor IA, Chat do Grupo, Comunicados, Analytics
- Planos: Gratuito, Básico (R$49,90), Intermediário (R$89,90), Avançado (R$119,90), Igreja (R$199,90)
- Multitracks: aluguel por 30 dias, cota mensal por plano
- Custom Mix: mixagem personalizada de stems, exporta em WAV
- Professor IA: feedback de prática musical via Gemini
- Suporte: e-mail suporte@multitrackgospel.com

SOBRE FATURAMENTO/ASSINATURA:
- Pagamentos processados via Stripe
- Para problemas com cobrança, cancelamento ou reembolso → orientar a contatar suporte@multitrackgospel.com
- Para trocar de plano → acessar "Meu Plano" no menu
- Para cancelar → acessar "Meu Plano" e clicar em cancelar

${faqContext ? `INFORMAÇÕES RELEVANTES DO FAQ:\n${faqContext}\n` : ""}

REGRAS IMPORTANTES:
1. Responda APENAS sobre o Liderweb — nunca sobre outros sistemas
2. Se a pergunta for sobre cobrança/fatura/pagamento → SEMPRE direcionar para suporte@multitrackgospel.com
3. Se não tiver certeza → admita e sugira abrir um ticket
4. Seja direto, objetivo e amigável em português brasileiro
5. Máximo 2 parágrafos curtos
6. NUNCA invente funcionalidades que não existem`;

  const prompt = `${systemContext}

PERGUNTA: ${question}

RESPOSTA:`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,  // baixo para respostas mais precisas
            maxOutputTokens: 400,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          ],
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
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
        suggestions = getSuggestions("", message);
      } else {
        answer = "Não encontrei uma resposta específica para essa dúvida. Nossa equipe pode ajudar — abra um chamado de suporte ou envie um e-mail para suporte@multitrackgospel.com.";
        source = "fallback";
      }
    }

    // Salvar log (silencioso — tabela pode não existir ainda)
    (prisma as any).supportChatLog?.create({
      data: {
        groupId: user.groupId ?? null,
        userId: user.id,
        question: message,
        answer,
        source,
        faqItemId: faqItemId ?? null,
      },
    }).catch(() => {});

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
