import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { MEMBER_FUNCTION_OPTIONS, PROFILE_VOICE_TYPE_OPTIONS, SKILL_LEVEL_OPTIONS } from "@/lib/member-profile";
import { SessionUser } from "@/lib/types";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";
import { ensureDefaultRoleFunctions } from "@/lib/role-functions";

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
  if (typeof value !== "string" || !value) return { date: null } as const;
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

// Valida URL https:// ou base64 de imagem (upload local)
const validateAvatarUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return { value: null } as const;
  // Base64 de imagem — aceitar diretamente
  if (value.startsWith("data:image/")) {
    // Limitar tamanho (~2MB em base64)
    if (value.length > 2.8 * 1024 * 1024) {
      return { error: "Imagem muito grande. Máximo 2MB." } as const;
    }
    return { value } as const;
  }
  // URL https normal
  try {
    const parsed = new URL(stripHtml(value));
    if (parsed.protocol !== "https:") return { error: "Avatar URL deve usar https://" } as const;
    return { value: parsed.toString() } as const;
  } catch {
    return { error: "Avatar URL inválido" } as const;
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
      include: {
        profile: true,
        accounts: { select: { provider: true } },
        memberFunctions: {
          include: { roleFunction: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const profile = dbUser.profile;
    const isGoogleUser = dbUser.accounts.some((a) => a.provider === "google");

    // Roles aprovados (fonte única de verdade)
    const approvedRoles = dbUser.memberFunctions
      .filter((mf) => !mf.isPending)
      .map((mf) => {
        const option = MEMBER_FUNCTION_OPTIONS.find((o) => o.label === mf.roleFunction.name);
        return option?.value ?? mf.roleFunction.name;
      });

    // Roles pendentes (sugeridos pelo membro, aguardando líder)
    const pendingRoles = dbUser.memberFunctions
      .filter((mf) => mf.isPending)
      .map((mf) => {
        const option = MEMBER_FUNCTION_OPTIONS.find((o) => o.label === mf.roleFunction.name);
        return option?.value ?? mf.roleFunction.name;
      });

    return NextResponse.json({
      displayName: dbUser.name,
      birthDate: profile?.birthDate ? profile.birthDate.toISOString().slice(0, 10) : "",
      // Fonte única: approvedRoles
      memberFunctions: approvedRoles,
      pendingRoles,
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
      isGoogleUser,
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
    const context = extractRequestContext(req);

    const before = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true },
    });

    const displayName = normalizeOptionalText(body?.displayName);
    if (!displayName) {
      return NextResponse.json({ error: "Nome de exibição é obrigatório" }, { status: 400 });
    }

    const birthDateParsed = parseBirthDate(body?.birthDate);
    if (birthDateParsed && "error" in birthDateParsed) {
      return NextResponse.json({ error: birthDateParsed.error }, { status: 400 });
    }

    // Valida roles enviados pelo membro
    const functions = Array.isArray(body?.memberFunctions)
      ? body.memberFunctions.filter((value: unknown) => typeof value === "string")
      : [];

    const invalidFunction = functions.find(
      (value: string) => !memberFunctionValues.has(value as any)
    );
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

    const avatarUrlCheck = validateAvatarUrl(body?.avatarUrl);
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

    // Salva dados do perfil (sem roles — roles vão para MemberFunction)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          name: displayName,
          ...(avatarUrlCheck.value !== undefined ? { avatarUrl: avatarUrlCheck.value } as any : {}),
        },
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
        },
      }),
    ]);

    // Salva roles como sugestões pendentes (membro sugere, líder aprova)
    if (functions.length > 0 && user.groupId) {
      const roleFunctionMap = await ensureDefaultRoleFunctions(user.groupId);

      // Remove sugestões pendentes anteriores
      await prisma.memberFunction.deleteMany({
        where: { memberId: user.id, isPending: true },
      });

      // Busca aprovados atuais para não duplicar
      const approved = await prisma.memberFunction.findMany({
        where: { memberId: user.id, isPending: false },
        select: { roleFunctionId: true },
      });
      const approvedIds = new Set(approved.map((a) => a.roleFunctionId));

      for (const roleValue of functions) {
        const roleFunctionId = roleFunctionMap[roleValue as keyof typeof roleFunctionMap];
        if (!roleFunctionId || approvedIds.has(roleFunctionId)) continue;

        await prisma.memberFunction.create({
          data: {
            memberId: user.id,
            roleFunctionId,
            isPending: true,
            suggestedAt: new Date(),
          },
        });
      }
    }

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true },
    });

    await logUserAction({
      userId: user.id,
      groupId: user.groupId ?? null,
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
      entityName: displayName,
      description: `Usuário ${displayName} atualizou o próprio perfil`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      oldValues: {
        name: before?.name,
        phone: before?.profile?.phone,
        city: before?.profile?.city,
        state: before?.profile?.state,
      },
      newValues: {
        name: after?.name,
        phone: after?.profile?.phone,
        city: after?.profile?.city,
        state: after?.profile?.state,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update me profile error:", error);
    return NextResponse.json({ error: "Erro ao salvar perfil" }, { status: 500 });
  }
}
