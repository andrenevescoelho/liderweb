export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { canAccessProfessorModule, generatePracticeFeedback } from "@/lib/professor";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId && user.role !== "SUPERADMIN") return NextResponse.json({ error: "Sem ministério" }, { status: 400 });

  const search = req.nextUrl.searchParams;
  const selectedUserId = search.get("userId");

  if (user.role !== "SUPERADMIN") {
    const access = await canAccessProfessorModule(user.id, user.groupId!, user.role);
    if (!access.enabled && !access.canConfigure) return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });
  }

  const targetUserId = (user.role === "ADMIN" || user.role === "LEADER" || user.role === "SUPERADMIN") && selectedUserId
    ? selectedUserId
    : user.id;

  const submissions = await prisma.practiceSubmission.findMany({
    where: {
      groupId: user.groupId ?? undefined,
      userId: targetUserId,
    },
    include: {
      feedbacks: {
        orderBy: { createdAt: "desc" },
      },
      user: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(submissions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!user.groupId || user.role === "SUPERADMIN") return NextResponse.json({ error: "Usuário sem ministério" }, { status: 400 });

  const access = await canAccessProfessorModule(user.id, user.groupId, user.role);
  if (!access.enabled) return NextResponse.json({ error: "Módulo não habilitado" }, { status: 403 });

  const body = await req.json();
  const { type, fileName, fileKey, fileUrl, mimeType, fileSize } = body ?? {};

  if (!["VOCAL", "INSTRUMENT", "MINISTRATION"].includes(type)) {
    return NextResponse.json({ error: "Tipo de prática inválido" }, { status: 400 });
  }

  if (!fileName || !fileKey || !fileUrl || !mimeType || typeof fileSize !== "number") {
    return NextResponse.json({ error: "Metadados de arquivo inválidos" }, { status: 400 });
  }

  if (!fileKey.includes(`/professor/${user.groupId}/${user.id}/`) && !fileKey.includes(`professor/${user.groupId}/${user.id}/`)) {
    return NextResponse.json({ error: "Arquivo não pertence ao usuário autenticado" }, { status: 403 });
  }

  const memberProfile = await prisma.memberProfile.findUnique({
    where: { userId: user.id },
    select: { instruments: true },
  });

  const coachProfile = await prisma.musicCoachProfile.findUnique({
    where: { userId: user.id },
    select: { roleType: true, instrument: true, currentFocus: true },
  });

  const createdSubmission = await prisma.practiceSubmission.create({
    data: {
      userId: user.id,
      groupId: user.groupId,
      type,
      fileName,
      fileKey,
      fileUrl,
      mimeType,
      fileSize,
      status: "ANALYZING",
    },
    include: { feedbacks: true },
  });

  const ctx = extractRequestContext(req);

  await logUserAction({
    userId: user.id,
    groupId: user.groupId,
    action: AUDIT_ACTIONS.PRACTICE_SUBMISSION_CREATED,
    entityType: "PROFESSOR",
    entityId: createdSubmission.id,
    entityName: createdSubmission.fileName,
    description: "Nova gravação enviada no módulo Professor",
    metadata: { type: createdSubmission.type, fileKey: createdSubmission.fileKey },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  const feedbackTemplate = await generatePracticeFeedback({
    type,
    fileName,
    roleType: coachProfile?.roleType,
    instrument: coachProfile?.instrument ?? memberProfile?.instruments?.[0] ?? null,
    currentFocus: coachProfile?.currentFocus,
  });

  const submission = await prisma.practiceSubmission.update({
    where: { id: createdSubmission.id },
    data: {
      status: "ANALYZED",
      feedbacks: {
        create: {
          score: feedbackTemplate.score,
          strengths: feedbackTemplate.strengths,
          improvements: feedbackTemplate.improvements,
          suggestions: feedbackTemplate.suggestions,
          feedbackText: feedbackTemplate.feedbackText,
          metricsJson: feedbackTemplate.metricsJson,
        },
      },
    },
    include: { feedbacks: true },
  });

  await prisma.progressHistory.create({
    data: {
      userId: user.id,
      groupId: user.groupId,
      metricType: "PRACTICE_SCORE",
      metricValue: feedbackTemplate.score,
      referenceId: submission.id,
    },
  });

  await logUserAction({
    userId: user.id,
    groupId: user.groupId,
    action: AUDIT_ACTIONS.PRACTICE_FEEDBACK_CREATED,
    entityType: "PROFESSOR",
    entityId: submission.feedbacks[0]?.id,
    description: "Feedback gerado automaticamente para submissão de prática",
    metadata: {
      submissionId: submission.id,
      score: submission.feedbacks[0]?.score,
      provider: process.env.ANTHROPIC_API_KEY ? "CLAUDE" : "RULE_BASED",
      model: process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-latest",
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json(submission, { status: 201 });
}
