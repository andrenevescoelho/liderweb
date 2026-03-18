import { prisma } from "@/lib/db";
import { MemberProfile, PracticeType, ProfessorRoleType, RoleFunction } from "@prisma/client";

export const PROFESSOR_ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/m4a", "audio/mp4"];
export const PROFESSOR_ALLOWED_EXTENSIONS = ["mp3", "wav", "m4a"];
export const PROFESSOR_MAX_FILE_SIZE = 20 * 1024 * 1024;

export function resolveProfessorRole(params: {
  profile?: Pick<MemberProfile, "memberFunction" | "instruments"> | null;
  roleFunctions?: Pick<RoleFunction, "name">[];
}): ProfessorRoleType {
  const values = [
    params.profile?.memberFunction,
    ...(params.roleFunctions?.map((item) => item.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (values.includes("ministro") || values.includes("líder") || values.includes("lider")) {
    return "MINISTER";
  }

  if (values.includes("vocal") || values.includes("cantor") || values.includes("backing")) {
    return "SINGER";
  }

  return "MUSICIAN";
}

export function resolvePrimaryInstrument(profile?: Pick<MemberProfile, "instruments"> | null): string | null {
  const [first] = profile?.instruments ?? [];
  return first ?? null;
}

export async function canAccessProfessorModule(userId: string, groupId: string, role: string) {
  if (role === "SUPERADMIN") {
    return { enabled: true, canConfigure: true };
  }

  const settings = await prisma.professorModuleSettings.findUnique({ where: { groupId } });
  const canConfigure = role === "ADMIN";

  if (canConfigure) {
    return {
      enabled: settings?.enabled ?? false,
      canConfigure,
    };
  }

  if (!settings?.enabled) {
    return { enabled: false, canConfigure: false };
  }

  if (settings.accessMode === "ALL_MEMBERS") {
    return { enabled: true, canConfigure: false };
  }

  const access = await prisma.professorAccess.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
    select: { enabled: true },
  });

  return { enabled: Boolean(access?.enabled), canConfigure: false };
}

export function buildFeedbackByType(type: PracticeType) {
  if (type === "VOCAL") {
    return {
      score: 78,
      strengths: ["Boa afinação geral", "Boa constância nas frases curtas"],
      improvements: ["Sustentação em notas longas", "Respiração entre frases"],
      suggestions: ["Praticar 10 minutos de apoio respiratório", "Exercícios de legato em semínimas"],
      feedbackText: "Sua afinação está boa, mas ainda pode evoluir na sustentação e no controle de respiração.",
      metricsJson: {
        pitch: 0.79,
        breathing: 0.71,
        interpretation: 0.76,
      },
    };
  }

  if (type === "INSTRUMENT") {
    return {
      score: 80,
      strengths: ["Ritmo consistente", "Boa dinâmica de base"],
      improvements: ["Precisão de entradas", "Variação de dinâmica em transições"],
      suggestions: ["Praticar com metrônomo em subdivisões", "Treinar transições entre partes da música"],
      feedbackText: "Seu ritmo está estável, com oportunidade de melhorar a precisão das entradas em mudanças de seção.",
      metricsJson: {
        timing: 0.82,
        precision: 0.74,
        dynamics: 0.78,
      },
    };
  }

  return {
    score: 76,
    strengths: ["Boa condução geral", "Boa clareza de comunicação"],
    improvements: ["Transições entre momentos", "Sensibilidade dinâmica"],
    suggestions: ["Praticar roteiros de ministração", "Rever pontos de comunicação com a equipe"],
    feedbackText: "Você conduz bem, mas pode tornar suas transições mais naturais para fortalecer a ministração.",
    metricsJson: {
      flow: 0.74,
      communication: 0.81,
      musicality: 0.73,
    },
  };
}

export function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

type AIPracticeFeedback = {
  score: number;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  feedbackText: string;
  metricsJson: Record<string, number>;
};

type GenerateFeedbackInput = {
  type: PracticeType;
  instrument?: string | null;
  roleType?: ProfessorRoleType;
  currentFocus?: string | null;
  fileName: string;
};

const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";

const extractFirstJsonObject = (text: string) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  return text.slice(start, end + 1);
};

function safeArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string").slice(0, 6);
}

function safeMetrics(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, metricValue]) => typeof metricValue === "number")
    .slice(0, 8);

  return Object.fromEntries(entries) as Record<string, number>;
}

function isClaudeEnabled() {
  return process.env.PROFESSOR_AI_ENABLED !== "false" && Boolean(process.env.ANTHROPIC_API_KEY);
}

async function generateFeedbackWithClaude(input: GenerateFeedbackInput): Promise<AIPracticeFeedback | null> {
  if (!isClaudeEnabled()) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-latest";
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = [
    "Você é um professor de música digital para ministério de louvor.",
    "Retorne SOMENTE JSON válido, sem markdown, sem comentários e sem texto extra.",
    "O JSON deve conter as chaves: score, strengths, improvements, suggestions, feedbackText, metricsJson.",
    "score deve ser inteiro de 0 a 100.",
    "strengths/improvements/suggestions devem ser arrays de strings curtas.",
    "metricsJson deve ter valores numéricos entre 0 e 1.",
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      contexto: "Análise inicial de prática musical no módulo Professor",
      tipoPratica: input.type,
      instrumento: input.instrument ?? null,
      papelMusical: input.roleType ?? null,
      focoAtual: input.currentFocus ?? null,
      nomeArquivo: input.fileName,
      observacao: "Ainda sem extração acústica automática; gere feedback pedagógico inicial com foco em evolução prática.",
    },
    null,
    2
  );

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[professor] claude error", response.status, errorText);
    return null;
  }

  const data = await response.json();
  const textOutput = data?.content?.find?.((part: any) => part?.type === "text")?.text as string | undefined;
  if (!textOutput) return null;

  const jsonText = extractFirstJsonObject(textOutput);
  if (!jsonText) return null;

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
  const feedbackText = typeof parsed.feedbackText === "string" ? parsed.feedbackText : null;

  if (score === null || !feedbackText) return null;

  return {
    score,
    feedbackText,
    strengths: safeArray(parsed.strengths),
    improvements: safeArray(parsed.improvements),
    suggestions: safeArray(parsed.suggestions),
    metricsJson: safeMetrics(parsed.metricsJson),
  };
}

export async function generatePracticeFeedback(input: GenerateFeedbackInput) {
  try {
    const aiFeedback = await generateFeedbackWithClaude(input);
    if (aiFeedback) return aiFeedback;
  } catch (error) {
    console.error("[professor] fallback feedback due to AI error", error);
  }

  return buildFeedbackByType(input.type);
}
