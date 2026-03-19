export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule } from "@/lib/professor";
import { AUDIT_ACTIONS, logUserAction, extractRequestContext } from "@/lib/audit-log";

const cache = new Map<string, { expiresAt: number; content: string }>();
const DAY_MS = 24 * 60 * 60 * 1000;

function getCacheKey(userId: string, tab: string, instrument?: string, voiceType?: string, level?: string) {
  return [userId, tab, instrument ?? "-", voiceType ?? "-", level ?? "-"].join(":");
}

function buildPrompt(tab: string, profile: { instrument?: string; voiceType?: string; level?: string }) {
  const tabPrompts: Record<string, string> = {
    hoje: "Crie um plano de estudo para hoje em tópicos curtos e objetivos.",
    exercicios: "Liste exercícios práticos com tempo estimado e progressão.",
    teoria: "Explique teoria musical aplicada ao louvor de forma simples.",
    dicas: "Dê dicas diretas para evolução musical no ministério de louvor.",
  };

  return [
    "Você é um professor de música para ministério de louvor.",
    tabPrompts[tab] ?? tabPrompts.hoje,
    `Instrumento: ${profile.instrument ?? "não informado"}.`,
    `Tipo vocal: ${profile.voiceType ?? "não informado"}.`,
    `Nível: ${profile.level ?? "não informado"}.`,
    "Responda em português do Brasil com markdown curto.",
  ].join(" ");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user?.id) {
    return new Response("Não autorizado", { status: 401 });
  }

  if (user.groupId && user.role !== "SUPERADMIN") {
    const access = await canAccessProfessorModule(user.id, user.groupId, user.role);
    if (!access.enabled) {
      return new Response("Módulo não habilitado", { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const tab = typeof body.tab === "string" ? body.tab.toLowerCase() : "hoje";
  const instrument = typeof body.instrument === "string" ? body.instrument : undefined;
  const voiceType = typeof body.voiceType === "string" ? body.voiceType : undefined;
  const level = typeof body.level === "string" ? body.level : undefined;

  const key = getCacheKey(user.id, tab, instrument, voiceType, level);
  const now = Date.now();
  const cached = cache.get(key);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (cached && cached.expiresAt > now) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: cached.content, cached: true })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const endpoint = process.env.MUSIC_COACH_LLM_ENDPOINT || process.env.OPENAI_BASE_URL || "https://api.anthropic.com/v1/messages";
        const prompt = buildPrompt(tab, { instrument, voiceType, level });

        let resultText = "";

        if (endpoint.includes("anthropic.com")) {
          const apiKey = process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

          const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-latest";
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 900,
              stream: true,
              messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
            }),
          });

          if (!response.ok || !response.body) {
            throw new Error(`Falha no provider LLM (${response.status})`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const text = parsed?.delta?.text ?? parsed?.content_block?.text ?? "";
                if (text) {
                  resultText += text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`));
                }
              } catch {
                continue;
              }
            }
          }
        } else {
          const token = process.env.OPENAI_API_KEY || process.env.ABACUS_API_KEY;
          if (!token) throw new Error("Chave de API LLM não configurada");

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              model: process.env.MUSIC_COACH_MODEL || "gpt-4o-mini",
              stream: false,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          const payload = await response.json();
          resultText = payload?.choices?.[0]?.message?.content ?? "";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: resultText })}\n\n`));
        }

        if (!resultText.trim()) {
          resultText = "Não consegui gerar conteúdo agora. Tente novamente em instantes.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: resultText })}\n\n`));
        }

        cache.set(key, { expiresAt: Date.now() + DAY_MS, content: resultText });

        const ctx = extractRequestContext(req);
        await logUserAction({
          userId: user.id,
          groupId: user.groupId,
          action: AUDIT_ACTIONS.COACH_CONTENT_GENERATED,
          entityType: "PROFESSOR",
          description: "Conteúdo do Music Coach gerado por IA",
          metadata: { tab, cached: false },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: error?.message ?? "Erro interno" })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
