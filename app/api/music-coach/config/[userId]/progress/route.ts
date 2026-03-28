import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as SessionUser;
    if (!["ADMIN", "SUPERADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { userId } = params;
    const groupId = user.groupId;

    if (!groupId && user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 400 });
    }

    // Buscar perfil do membro
    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        profile: { select: { memberFunction: true, instruments: true, voiceType: true } },
        musicCoachProfiles: {
          where: groupId ? { groupId } : {},
          select: { enabled: true, level: true },
        },
      },
    });

    if (!member) return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });

    // Buscar todas as submissões do membro no grupo
    const submissions = await prisma.practiceSubmission.findMany({
      where: {
        userId,
        ...(groupId ? { groupId } : {}),
      },
      include: { feedback: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        memberFunction: member.profile?.memberFunction || null,
        instruments: member.profile?.instruments || [],
        voiceType: member.profile?.voiceType || null,
        coachEnabled: member.musicCoachProfiles[0]?.enabled ?? false,
        level: member.musicCoachProfiles[0]?.level ?? 1,
      },
      submissions: submissions.map((s) => ({
        id: s.id,
        type: s.type,
        instrument: s.instrument,
        createdAt: s.createdAt,
        feedback: s.feedback
          ? {
              score: s.feedback.score,
              feedback: s.feedback.feedback,
              metricsJson: s.feedback.metricsJson,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[music-coach/config/userId] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
