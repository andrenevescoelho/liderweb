import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { getFileUrl } from "@/lib/s3";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

// Helper to detect audio format from content type or extension
function getAudioFormat(contentType: string, path: string): string {
  if (contentType.includes("mp3") || contentType.includes("mpeg")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("m4a") || contentType.includes("mp4")) return "m4a";
  if (contentType.includes("flac")) return "flac";
  // Fallback to extension
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext && ["mp3", "wav", "ogg", "webm", "m4a", "flac"].includes(ext)) return ext;
  return "wav"; // default to wav which is widely supported
}

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
    const { cloud_storage_path, type, instrument, notes } = body;

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
    const apiKey = process.env.ABACUSAI_API_KEY;
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

    // Get signed URL for audio and download it
    const audioUrl = await getFileUrl(cloud_storage_path, false);
    let audioBase64: string | null = null;
    let audioFormat = "wav";
    
    try {
      const audioResponse = await fetch(audioUrl);
      if (audioResponse.ok) {
        const contentType = audioResponse.headers.get("content-type") || "";
        audioFormat = getAudioFormat(contentType, cloud_storage_path);
        const audioBuffer = await audioResponse.arrayBuffer();
        audioBase64 = Buffer.from(audioBuffer).toString("base64");
        console.log(`[music-coach/submit] Audio downloaded: ${audioBuffer.byteLength} bytes, format: ${audioFormat}`);
      }
    } catch (downloadErr) {
      console.error("[music-coach/submit] Audio download error:", downloadErr);
    }

    const profileCtx = [
      `Nível: ${coachProfile.level}`,
      roles.length > 0 ? `Funções: ${roles.join(", ")}` : null,
      (memberProfile?.instruments || []).length > 0 ? `Instrumentos: ${(memberProfile?.instruments || []).join(", ")}` : null,
      memberProfile?.voiceType ? `Tipo vocal: ${memberProfile.voiceType}` : null,
      type === "vocal" ? "O aluno enviou uma prática vocal" : `O aluno enviou uma prática de ${instrument || type}`,
      notes ? `Observações do aluno: ${notes}` : null,
    ].filter(Boolean).join(". ");

    const systemPrompt = `Você é um professor de música cristã especializado em ministério de louvor. ${audioBase64 ? "Analise o áudio de prática enviado pelo aluno e forneça feedback detalhado baseado no que você ouviu." : "Forneça feedback pedagógico baseado no contexto do aluno."}

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
      // Build message content
      type MessageContent = { type: string; text?: string; input_audio?: { data: string; format: string } };
      const userContent: MessageContent[] = [
        { 
          type: "text", 
          text: `Analise minha prática de ${type}${instrument ? ` (${instrument})` : ""} e me dê feedback detalhado.${notes ? ` Minhas observações: ${notes}` : ""}` 
        },
      ];
      
      // Add audio if available
      if (audioBase64) {
        userContent.push({
          type: "input_audio",
          input_audio: {
            data: audioBase64,
            format: audioFormat,
          },
        });
      }

      const llmResponse = await fetch("https://apps.abacus.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-2024-11-20",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 1000,
        }),
      });

      let feedbackData: { score?: number; feedback?: string; suggestions?: string; metricsJson?: Record<string, unknown> } = {};

      if (llmResponse.ok) {
        const llmData = await llmResponse.json();
        const rawContent = llmData.choices?.[0]?.message?.content || "";
        
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
