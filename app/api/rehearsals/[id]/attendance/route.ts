export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

const db = prisma as any;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const rehearsal = await db.rehearsal.findUnique({
      where: { id: params.id },
      select: { id: true, groupId: true },
    });

    if (!rehearsal) return NextResponse.json({ error: "Ensaio não encontrado" }, { status: 404 });

    if (user.role !== "SUPERADMIN" && rehearsal.groupId !== user.groupId) {
      return NextResponse.json({ error: "Sem permissão para confirmar presença" }, { status: 403 });
    }

    const { status, justification, memberId } = await req.json();
    const context = extractRequestContext(req);

    const canManageAttendance =
      user.role === "SUPERADMIN" ||
      user.role === "ADMIN" ||
      hasPermission(user.role, "rehearsal.manage", user.permissions);

    const targetMemberId = canManageAttendance ? memberId || user.id : user.id;

    const previousAttendance = await db.rehearsalAttendance.findUnique({
      where: { rehearsalId_memberId: { rehearsalId: params.id, memberId: targetMemberId } },
    });

    const attendance = await db.rehearsalAttendance.upsert({
      where: {
        rehearsalId_memberId: {
          rehearsalId: params.id,
          memberId: targetMemberId,
        },
      },
      create: {
        rehearsalId: params.id,
        memberId: targetMemberId,
        status: status || "PENDING",
        justification: justification || null,
      },
      update: {
        status: status || "PENDING",
        justification: justification || null,
      },
    });

    await logUserAction({
      userId: user.id,
      groupId: rehearsal.groupId ?? user.groupId ?? null,
      action: AUDIT_ACTIONS.REHEARSAL_ATTENDANCE_UPDATED,
      entityType: AuditEntityType.REHEARSAL,
      entityId: rehearsal.id,
      entityName: `Ensaio ${rehearsal.id}`,
      description: `Presença de ensaio atualizada por ${user.name}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { targetMemberId },
      oldValues: { status: previousAttendance?.status, justification: previousAttendance?.justification },
      newValues: { status: attendance.status, justification: attendance.justification },
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Attendance error:", error);
    return NextResponse.json({ error: "Erro ao confirmar presença" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  return POST(req, ctx);
}
