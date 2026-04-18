export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { sendSmtpMail } from "@/lib/smtp";
import { presenceResponseEmail } from "@/lib/email-templates";
import { AuditEntityType } from "@prisma/client";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const userId = user?.id;
    const role = user?.role;
    const userRole =
      role === "SUPERADMIN" || role === "ADMIN" || role === "LEADER" || role === "MEMBER"
        ? role
        : "MEMBER";
    const userPermissions = user?.permissions ?? [];

    if (!hasPermission(userRole, "schedule.presence.confirm.self", userPermissions)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const context = extractRequestContext(req);
    const { roleId, status } = body ?? {};

    if (!roleId || !status) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (status !== "ACCEPTED" && status !== "DECLINED") {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const scheduleRole = await prisma.scheduleRole.findFirst({
      where: {
        id: roleId,
        scheduleId: params?.id,
        memberId: userId,
      },
    });

    if (!scheduleRole) {
      return NextResponse.json(
        { error: "Compromisso não encontrado" },
        { status: 404 }
      );
    }

    const updatedRole = await prisma.scheduleRole.update({
      where: { id: roleId },
      data: { status },
    });

    await logUserAction({
      userId: userId,
      groupId: user.groupId ?? null,
      action: status === "ACCEPTED" ? AUDIT_ACTIONS.SCALE_CONFIRMED : AUDIT_ACTIONS.SCALE_DECLINED,
      entityType: AuditEntityType.SCALE,
      entityId: params?.id,
      entityName: `Escala ${params?.id}`,
      description: `Usuário ${user.name} ${status === "ACCEPTED" ? "confirmou" : "recusou"} participação em escala`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { roleId, status },
    });

    // ── Notificar admin sobre a resposta ────────────────────────────────
    try {
      const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";

      // Buscar dados completos da escala e do admin
      const schedule = await prisma.schedule.findUnique({
        where: { id: params?.id },
        include: {
          group: {
            include: {
              users: {
                where: { role: { in: ["ADMIN", "LEADER"] } },
                select: { name: true, email: true, role: true },
                take: 3,
              },
            },
          },
        },
      });

      if (schedule?.group) {
        const groupName = schedule.group.name ?? "Ministério";
        const memberName = user.name ?? "Membro";
        const roleLabel = scheduleRole.role ?? "Membro";

        for (const admin of schedule.group.users) {
          if (!admin.email || admin.email === user.email) continue;
          const { subject, html } = presenceResponseEmail({
            adminName: admin.name ?? "Líder",
            adminEmail: admin.email,
            groupName,
            memberName,
            scheduleName: schedule.name ?? "Escala",
            scheduleDate: schedule.date,
            memberRole: roleLabel,
            status: status as "ACCEPTED" | "DECLINED",
            scheduleId: params?.id,
          });
          await sendSmtpMail({ to: admin.email, subject, html, fromEmail, fromName: "Líder Web" })
            .catch(err => console.warn(`[respond] email para ${admin.email} falhou:`, err));
        }
      }
    } catch (emailErr) {
      console.warn("[respond] Erro ao enviar email:", emailErr);
    }
    // ─────────────────────────────────────────────────────────────────────

    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error("Respond to schedule error:", error);
    return NextResponse.json(
      { error: "Erro ao responder escala" },
      { status: 500 }
    );
  }
}
