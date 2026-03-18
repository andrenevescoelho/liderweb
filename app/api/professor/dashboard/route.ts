export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule, resolvePrimaryInstrument, resolveProfessorRole } from "@/lib/professor";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem ministério" }, { status: 400 });

  if (user.role !== "SUPERADMIN") {
    const access = await canAccessProfessorModule(user.id, user.groupId!, user.role);
    if (!access.enabled && !access.canConfigure) {
      return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
    }
  }

  const profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });

  const [coachProfile, submissions, avgScore] = await Promise.all([
    prisma.musicCoachProfile.findUnique({ where: { userId: user.id } }),
    prisma.practiceSubmission.findMany({
      where: { userId: user.id },
      include: { feedbacks: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.practiceFeedback.aggregate({
      where: { submission: { userId: user.id } },
      _avg: { score: true },
    }),
  ]);

  const inferredRole = resolveProfessorRole({ profile, roleFunctions: [] });
  const roleType = coachProfile?.roleType ?? inferredRole;

  return NextResponse.json({
    roleType,
    instrument: coachProfile?.instrument ?? resolvePrimaryInstrument(profile),
    level: coachProfile?.level ?? null,
    currentFocus: coachProfile?.currentFocus ?? null,
    recentSubmissions: submissions,
    avgScore: avgScore._avg.score ? Math.round(avgScore._avg.score) : null,
    strengths: submissions.flatMap((item) => item.feedbacks[0]?.strengths ?? []).slice(0, 4),
    improvements: submissions.flatMap((item) => item.feedbacks[0]?.improvements ?? []).slice(0, 4),
  });
}
