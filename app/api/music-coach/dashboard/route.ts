import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const memberProfile = await prisma.memberProfile.findUnique({
      where: { userId: user.id },
      select: {
        memberFunction: true,
        instruments: true,
        voiceType: true,
      },
    });

    const memberFunctions = await prisma.memberFunction.findMany({
      where: { memberId: user.id },
      include: { roleFunction: { select: { name: true } } },
    });

    const submissionCount = await prisma.practiceSubmission.count({
      where: { userId: user.id, groupId: user.groupId },
    });

    const latestProgress = await prisma.progressHistory.findMany({
      where: { userId: user.id, groupId: user.groupId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      level: coachProfile.level,
      memberFunction: memberProfile?.memberFunction || null,
      instruments: memberProfile?.instruments || [],
      voiceType: memberProfile?.voiceType || null,
      roles: memberFunctions.map((mf) => mf.roleFunction.name),
      submissionCount,
      latestProgress,
    });
  } catch (err) {
    console.error("[music-coach/dashboard] error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
