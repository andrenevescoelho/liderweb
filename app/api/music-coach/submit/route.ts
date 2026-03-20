import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";
import { getFileUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const coachProfile = await prisma.musicCoachProfile.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: user.groupId } },
    });
    if (!coachProfile?.enabled) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }

    const body = await req.json();
    const { cloud_storage_path, type, instrument, notes, audioBase64 } = body;

    if (!cloud_storage_path || !type) {
      return NextResponse.json({ error: "cloud_storage_path e type são obrigatórios" }, { status: 400 });
    }

    // Create the submission
    const submission = await prisma.practiceSubmission.create({
      data: {
        userId: user.id,
        groupId: user.groupId,
        audioUrl: cloud_storage_path,
        type,
        instrument: instrument || null,
        notes: notes || null,
      },
    });

    // Audit log for practice submission
    await logUserAction({
      userId: user.id,
      groupId: user.groupId,
      action: AUDIT_ACTIONS.COACH_PRACTICE_SUBMITTED,
      entityType: "COACH",
      entityId: submission.id,
      description: `Prática de ${type}${instrument ? ` (${instrument})` : ""} enviada`,
      metadata: { type, instrument, hasNotes: !!notes },
    });

    // Now analyze with AI
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ submission, feedback: null, error: "API key não configurada" });
    }

    // Get member profile for context
    const memberProfile = await prisma.memberProfile.findUnique({
      where: { userId: user.id },
      select: { memberFunction: true, instruments: true, voiceType: true },
    });
    const memberFunctions = await prisma.memberFunction.findMany({
      where: { memberId: user.id },
      include: { roleFunction: { select: { name: true } } },
    });
    const roles = memberFunctions.map((mf) => mf.roleFunction.name);

    const profileCtx = [
      `Nível: ${coachProfile.level}`,
      roles.length > 0 ? `Funções: ${roles.join(", ")}` : null,
      (memberProfile?.instruments || []).length > 0 ? `Instrumentos: ${(memberProfile?.instruments || []).join(", ")}` : null,
      memberProfile?.voiceType ? `Tipo vocal: ${memberProfile.voiceType}` : null,
      type === "vocal" ? "O aluno enviou uma prática vocal" : `O aluno enviou uma prática de ${instrument || type}`,
      notes ? `Observações do aluno: ${notes}` : null,
    ].filter(Boolean).join(". ");

    const systemPrompt = `Você é um professor de música cristã especializado em ministério de louvor. Forneça feedback pedagógico detalhado baseado no contexto e perfil do aluno.

Perfil do aluno: ${profileCtx}

Responda em português brasileiro no seguinte formato JSON (sem markdown, apenas JSON puro):
{
  "score": <número de 0 a 100>,
  "feedback": "<feedback geral sobre a performance, mencionando aspectos específicos que você observou>",
  "pontos_fortes": ["<ponto forte específico>", "<outro ponto forte>"],
  "areas_melhoria": ["<área para melhorar>", "<outra área>"],
  "sugestoes": ["<sugestão prática específica>", "<outra sugestão>", "<terceira sugestão>"],
  "exercicio_recomendado": "<exercício específico para melhorar>"
}

Seja específico, prático e encorajador nas suas observações.`;

    try {
      // Download audio from S3
      console.log("[music-coach/submit] cloud_storage_path recebido:", cloud_storage_path);
      const audioUrl = await getFileUrl(cloud_storage_path, false);
      console.log("[music-coach/submit] audioUrl gerada pelo getFileUrl:", audioUrl);
      const audioResponse = await fetch(audioUrl);
      console.log("[music-coach/submit] status HTTP da resposta S3:", audioResponse.status);
      const contentType = audioResponse.headers.get("content-type") || "";
      console.log("[music-coach/submit] content-type recebido:", contentType);
      const audioFormat = contentType.split("/")[1]?.split(";")[0] || "unknown";
      console.log("[music-coach/submit] audioFormat detectado:", audioFormat);
      const SUPPORTED_FORMATS = ["mp3", "mp4", "wav", "flac", "ogg", "webm", "mpeg"];
      const isAudioFormatSupported = SUPPORTED_FORMATS.includes(audioFormat);
      console.log("[music-coach/submit] isAudioFormatSupported:", isAudioFormatSupported);

      let s3AudioBase64: string | null = null;
      if (isAudioFormatSupported) {
        const audioBuffer = await audioResponse.arrayBuffer();
        console.log("[music-coach/submit] audioBuffer tamanho em bytes:", audioBuffer.byteLength);
        s3AudioBase64 = Buffer.from(audioBuffer).toString("base64");
        console.log("[music-coach/submit] s3AudioBase64 tamanho em chars:", s3AudioBase64.length);
      } else {
        console.log("[music-coach/submit] formato não suportado, pulando leitura do buffer");
      }

      const resolvedAudioBase64 = s3AudioBase64 || audioBase64 || null;
      console.log("[music-coach/submit] resolvedAudioBase64 (s3 ou body):", resolvedAudioBase64 ? `${resolvedAudioBase64.length} chars` : "NULL");

      const promptText = `${systemPrompt}\n\nAnalise minha prática de ${type}${instrument ? ` (${instrument})` : ""} e me dê feedback detalhado.${notes ? ` Minhas observações: ${notes}` : ""}`;

      const parts: object[] = [];

      if (resolvedAudioBase64 && isAudioFormatSupported) {
        const mediaType = contentType.split(";")[0].trim() || `audio/${audioFormat}`;
        parts.push({ inline_data: { mime_type: mediaType, data: resolvedAudioBase64 } });
        console.log("[music-coach/submit] bloco de áudio adicionado ao Gemini, mime_type:", mediaType);
      } else {
        console.log("[music-coach/submit] sem áudio para enviar à API, usando apenas contexto textual");
      }

      parts.push({ text: promptText });

      const llmResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      );

      let feedbackData: { score?: number; feedback?: string; suggestions?: string; metricsJson?: Record<string, unknown> } = {};

      if (llmResponse.ok) {
        const llmData = await llmResponse.json();
        const rawContent = llmData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Try to parse JSON from response
        try {
          const cleaned = rawContent.replace(/```json\n?|```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          feedbackData = {
            score: Math.min(100, Math.max(0, parsed.score || 0)),
            feedback: parsed.feedback || rawContent,
            suggestions: [
              ...(parsed.sugestoes || []),
              parsed.exercicio_recomendado ? `Exercício: ${parsed.exercicio_recomendado}` : null,
            ].filter(Boolean).join("\n"),
            metricsJson: {
              pontos_fortes: parsed.pontos_fortes || [],
              areas_melhoria: parsed.areas_melhoria || [],
              exercicio_recomendado: parsed.exercicio_recomendado || "",
            },
          };
        } catch {
          feedbackData = {
            score: 70,
            feedback: rawContent,
            suggestions: "",
            metricsJson: {},
          };
        }
      } else {
        const errorBody = await llmResponse.text();
        console.error("[music-coach/submit] LLM error:", llmResponse.status, errorBody);
        feedbackData = {
          score: null as unknown as number,
          feedback: "Não foi possível analisar o áudio automaticamente. Um líder poderá revisar sua prática.",
          suggestions: "",
          metricsJson: {},
        };
      }

      // Save feedback
      const feedback = await prisma.practiceFeedback.create({
        data: {
          submissionId: submission.id,
          score: feedbackData.score || null,
          feedback: feedbackData.feedback || null,
          suggestions: feedbackData.suggestions || null,
          metricsJson: (feedbackData.metricsJson || {}) as any,
        },
      });

      // Audit log for feedback generation
      if (feedbackData.score !== null) {
        await logUserAction({
          userId: user.id,
          groupId: user.groupId,
          action: AUDIT_ACTIONS.COACH_FEEDBACK_GENERATED,
          entityType: "COACH",
          entityId: feedback.id,
          description: `Feedback gerado pelo Professor IA (nota: ${feedbackData.score})`,
          metadata: { submissionId: submission.id, score: feedbackData.score },
        });
      }

      return NextResponse.json({ submission, feedback });
    } catch (llmErr) {
      console.error("[music-coach/submit] AI analysis error:", llmErr);
      // Still return the submission even if AI fails
      return NextResponse.json({ submission, feedback: null });
    }
  } catch (err) {
    console.error("[music-coach/submit] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
