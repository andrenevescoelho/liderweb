import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { MEMBER_FUNCTION_OPTIONS, PROFILE_VOICE_TYPE_OPTIONS, SKILL_LEVEL_OPTIONS } from "@/lib/member-profile";
import { SessionUser } from "@/lib/types";

const MAX_BIO_LENGTH = 2000;
const MAX_NOTES_LENGTH = 1000;
const MAX_TEXT_LENGTH = 255;

const memberFunctionValues = new Set(MEMBER_FUNCTION_OPTIONS.map((item) => item.value));
const skillLevelValues = new Set(SKILL_LEVEL_OPTIONS.map((item) => item.value));
const profileVoiceTypeValues = new Set(PROFILE_VOICE_TYPE_OPTIONS.map((item) => item.value));

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, "").trim();

const normalizeOptionalText = (value: unknown, maxLength = MAX_TEXT_LENGTH) => {
  if (typeof value !== "string") return null;
  const sanitized = stripHtml(value);
  if (!sanitized) return null;
  return sanitized.slice(0, maxLength);
};

const parseBirthDate = (value: unknown) => {
  if (typeof value !== "string" || !value) return { error: "Data de aniversário é obrigatória" } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Data de aniversário inválida" } as const;

  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { error: "Data de aniversário inválida" } as const;

  return { date } as const;
};

const validateHttpsUrl = (value: unknown, fieldLabel: string) => {
  if (typeof value !== "string" || !value.trim()) return { value: null } as const;
  const sanitized = stripHtml(value);

  try {
    const parsed = new URL(sanitized);
    if (parsed.protocol !== "https:") {
      return { error: `${fieldLabel} deve usar https://` } as const;
    }
    return { value: parsed.toString() } as const;
  } catch {
    return { error: `${fieldLabel} inválido` } as const;
  }
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const profile = dbUser.profile;

    return NextResponse.json({
      displayName: dbUser.name,
      birthDate: profile?.birthDate ? profile.birthDate.toISOString().slice(0, 10) : "",
      memberFunctions: profile?.memberFunctions ?? [],
      availability: profile?.availability ?? [],
      phone: profile?.phone ?? "",
      city: profile?.city ?? "",
      state: profile?.state ?? "",
      bio: profile?.bio ?? "",
      profileVoiceType: profile?.profileVoiceType ?? "",
      vocalRangeKey: profile?.vocalRangeKey ?? "",
      skillLevel: profile?.skillLevel ?? "",
      availabilityNotes: profile?.availabilityNotes ?? "",
      repertoirePrefs: profile?.repertoirePrefs ?? "",
      avatarUrl: profile?.avatarUrl ?? "",
      instagram: profile?.instagram ?? "",
      youtube: profile?.youtube ?? "",
    });
  } catch (error) {
    console.error("Get me profile error:", error);
    return NextResponse.json({ error: "Erro ao buscar perfil" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    const body = await req.json();

    const displayName = normalizeOptionalText(body?.displayName);
    if (!displayName) {
      return NextResponse.json({ error: "Nome de exibição é obrigatório" }, { status: 400 });
    }

    const birthDateParsed = parseBirthDate(body?.birthDate);
    if (birthDateParsed && "error" in birthDateParsed) {
      return NextResponse.json({ error: birthDateParsed.error }, { status: 400 });
    }

    const functions = Array.isArray(body?.memberFunctions)
      ? body.memberFunctions.filter((value: unknown) => typeof value === "string")
      : [];

    if (!functions.length) {
      return NextResponse.json({ error: "Selecione ao menos uma função no ministério" }, { status: 400 });
    }

    const invalidFunction = functions.find((value: string) => !memberFunctionValues.has(value as any));
    if (invalidFunction) {
      return NextResponse.json({ error: `Função inválida: ${invalidFunction}` }, { status: 400 });
    }

    const profileVoiceType = normalizeOptionalText(body?.profileVoiceType, 30)?.toLowerCase() ?? null;
    if (profileVoiceType && !profileVoiceTypeValues.has(profileVoiceType as any)) {
      return NextResponse.json({ error: "Tipo de voz inválido" }, { status: 400 });
    }

    const skillLevel = normalizeOptionalText(body?.skillLevel, 20)?.toUpperCase() ?? null;
    if (skillLevel && !skillLevelValues.has(skillLevel as any)) {
      return NextResponse.json({ error: "Nível inválido" }, { status: 400 });
    }

    const avatarUrlCheck = validateHttpsUrl(body?.avatarUrl, "Avatar URL");
    if ("error" in avatarUrlCheck) {
      return NextResponse.json({ error: avatarUrlCheck.error }, { status: 400 });
    }

    const instagramCheck = validateHttpsUrl(body?.instagram, "Instagram");
    if ("error" in instagramCheck) {
      return NextResponse.json({ error: instagramCheck.error }, { status: 400 });
    }

    const youtubeCheck = validateHttpsUrl(body?.youtube, "YouTube");
    if ("error" in youtubeCheck) {
      return NextResponse.json({ error: youtubeCheck.error }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { name: displayName },
      }),
      prisma.memberProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          phone: normalizeOptionalText(body?.phone, 30),
          birthDate: birthDateParsed && "date" in birthDateParsed ? birthDateParsed.date : null,
          city: normalizeOptionalText(body?.city, 120),
          state: normalizeOptionalText(body?.state, 2)?.toUpperCase() ?? null,
          bio: normalizeOptionalText(body?.bio, MAX_BIO_LENGTH),
          avatarUrl: avatarUrlCheck.value,
          profileVoiceType,
          vocalRangeKey: normalizeOptionalText(body?.vocalRangeKey, 10),
          skillLevel: skillLevel as any,
          availability: Array.isArray(body?.availability)
            ? body.availability.filter((value: unknown) => typeof value === "string")
            : [],
          availabilityNotes: normalizeOptionalText(body?.availabilityNotes, MAX_NOTES_LENGTH),
          repertoirePrefs: normalizeOptionalText(body?.repertoirePrefs, MAX_NOTES_LENGTH),
          instagram: instagramCheck.value,
          youtube: youtubeCheck.value,
          memberFunctions: functions as any,
        },
        update: {
          phone: normalizeOptionalText(body?.phone, 30),
          birthDate: birthDateParsed && "date" in birthDateParsed ? birthDateParsed.date : null,
          city: normalizeOptionalText(body?.city, 120),
          state: normalizeOptionalText(body?.state, 2)?.toUpperCase() ?? null,
          bio: normalizeOptionalText(body?.bio, MAX_BIO_LENGTH),
          avatarUrl: avatarUrlCheck.value,
          profileVoiceType,
          vocalRangeKey: normalizeOptionalText(body?.vocalRangeKey, 10),
          skillLevel: skillLevel as any,
          availability: Array.isArray(body?.availability)
            ? body.availability.filter((value: unknown) => typeof value === "string")
            : [],
          availabilityNotes: normalizeOptionalText(body?.availabilityNotes, MAX_NOTES_LENGTH),
          repertoirePrefs: normalizeOptionalText(body?.repertoirePrefs, MAX_NOTES_LENGTH),
          instagram: instagramCheck.value,
          youtube: youtubeCheck.value,
          memberFunctions: functions as any,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update me profile error:", error);
    return NextResponse.json({ error: "Erro ao salvar perfil" }, { status: 500 });
  }
}
