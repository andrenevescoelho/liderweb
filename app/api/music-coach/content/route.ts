import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";
import { canAccessFeature } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    // Verificar entitlement do plano
    const hasAccess = await canAccessFeature(user.groupId, "professor");
    if (!hasAccess) {
      return NextResponse.json({
        error: "Seu plano não inclui o Professor IA. Faça upgrade para acessar.",
        code: "PLAN_UPGRADE_REQUIRED",
        requiredFeature: "professor",
      }, { status: 402 });
    }

    const coachProfile = await prisma.musicCoachProfile.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: user.groupId } },
    });
    if (!coachProfile?.enabled) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }

    const body = await req.json();
    const contentType = body.type || "general";
    const forceRefresh = body.forceRefresh === true;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await prisma.coachContentCache.findUnique({
        where: { userId_groupId_contentType: { userId: user.id, groupId: user.groupId, contentType } },
      });
      if (cached && Date.now() - cached.generatedAt.getTime() < CACHE_TTL_MS) {
        return NextResponse.json({ content: cached.content, cached: true });
      }
    }

    // Fetch member profile for personalized content
    const memberProfile = await prisma.memberProfile.findUnique({
      where: { userId: user.id },
      select: { memberFunction: true, instruments: true, voiceType: true },
    });

    const memberFunctions = await prisma.memberFunction.findMany({
      where: { memberId: user.id },
      include: { roleFunction: { select: { name: true } } },
    });

    const roles = memberFunctions.map((mf) => mf.roleFunction.name);
    const instruments = memberProfile?.instruments || [];
    const voiceType = memberProfile?.voiceType || null;
    const level = coachProfile.level;

    const profileDescription = [
      `Nível atual: ${level}`,
      roles.length > 0 ? `Funções no ministério: ${roles.join(", ")}` : null,
      instruments.length > 0 ? `Instrumentos: ${instruments.join(", ")}` : null,
      voiceType ? `Tipo vocal: ${voiceType}` : null,
      memberProfile?.memberFunction ? `Função principal: ${memberProfile.memberFunction}` : null,
    ].filter(Boolean).join(". ");

    const prompts: Record<string, string> = {
      general: `Você é um professor de música cristã especializado em ministério de louvor. Com base no perfil do aluno (${profileDescription}), gere um conteúdo personalizado com:\n1. Uma saudação motivacional personalizada\n2. Dica do dia relacionada ao instrumento/função do aluno\n3. Um exercício prático simples para fazer hoje\n4. Uma recomendação de estudo (técnica musical ou teoria)\nResponda em português brasileiro, de forma encorajadora e prática.`,
      exercises: `Você é um professor de música cristã. Com base no perfil do aluno (${profileDescription}), crie 3 exercícios práticos progressivos adequados ao nível ${level}. Cada exercício deve ter: título, descrição detalhada, duração sugerida e dica de execução. Foque em técnicas relevantes para ministério de louvor. Responda em português brasileiro.`,
      theory: `Você é um professor de teoria musical para ministério de louvor. Com base no perfil do aluno (${profileDescription}), ensine um conceito de teoria musical adequado ao nível ${level}. Inclua: explicação clara, exemplos práticos, como aplicar no contexto de louvor, e um mini-quiz com 2 perguntas. Responda em português brasileiro.`,
      tips: `Você é um mentor de ministério de louvor. Com base no perfil do aluno (${profileDescription}), compartilhe 5 dicas práticas para melhorar a performance no ministério. Considere o nível ${level} e as funções do aluno. Inclua dicas sobre: técnica, musicalidade, entrosamento com a equipe, e crescimento espiritual através da música. Responda em português brasileiro.`,
    };

    const systemPrompt = prompts[contentType] || prompts.general;

    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key não configurada" }, { status: 500 });
    }

    const llmResponse = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere o conteúdo de ${contentType === "general" ? "hoje" : contentType} para mim.` },
        ],
        stream: true,
      }),
    });

    if (!llmResponse.ok || !llmResponse.body) {
      console.error("[music-coach/content] LLM error:", llmResponse.status);
      return NextResponse.json({ error: "Erro ao gerar conteúdo" }, { status: 500 });
    }

    // Stream the response and accumulate for cache
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = "";
    const userId = user.id;
    const groupId = user.groupId;

    const readable = new ReadableStream({
      async start(controller) {
        const reader = llmResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter((l) => l.startsWith("data: "));
            for (const line of lines) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                // Save to cache before closing
                try {
                  await prisma.coachContentCache.upsert({
                    where: { userId_groupId_contentType: { userId, groupId, contentType } },
                    create: { userId, groupId, contentType, content: fullContent },
                    update: { content: fullContent, generatedAt: new Date() },
                  });
                  // Audit log for content generation
                  await logUserAction({
                    userId,
                    groupId,
                    action: AUDIT_ACTIONS.COACH_CONTENT_GENERATED,
                    entityType: "COACH",
                    description: `Conteúdo de ${contentType} gerado pelo Professor IA`,
                    metadata: { contentType, contentLength: fullContent.length },
                  });
                } catch (cacheErr) {
                  console.error("[music-coach/content] cache save error:", cacheErr);
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                break;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }
        } catch (err) {
          console.error("[music-coach/content] stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[music-coach/content] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
