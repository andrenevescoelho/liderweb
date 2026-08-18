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
import { sendPushToMany, getPushTokensForUsers } from "@/lib/push-notifications";
import { handleScheduleDecline } from "@/lib/schedule-replacement";
import { filterUsersByNotifPref } from "@/lib/notification-prefs";

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
    const { roleId, status, declineReason, declineNote } = body ?? {};

    if (!roleId || !status) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (status !== "ACCEPTED" && status !== "DECLINED") {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    if (status === "DECLINED" && !declineReason) {
      return NextResponse.json({ error: "Informe o motivo da recusa" }, { status: 400 });
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

    let updatedRole: any;

    if (status === "DECLINED") {
      // Ao recusar: remover da escala (mais limpo visualmente)
      // O audit log garante rastreabilidade completa
      await prisma.scheduleRole.delete({ where: { id: roleId } });
      // Manter referência local para uso no restante do fluxo
      updatedRole = { ...scheduleRole, status: "DECLINED", declineReason, declineNote };
    } else {
      await prisma.$executeRaw`
        UPDATE "ScheduleRole" SET status = ${status}::"InviteStatus" WHERE id = ${roleId}
      `;
      updatedRole = await prisma.scheduleRole.findUnique({ where: { id: roleId } });
    }

    // ── Substituição automática quando membro recusa ────────────────────
    if (status === "DECLINED" && scheduleRole.memberId && scheduleRole.role) {
      const _scheduleId = params?.id;
      const _roleName = scheduleRole.role;
      const _groupId = user.groupId ?? "";
      handleScheduleDecline({
        scheduleId: _scheduleId,
        scheduleRoleId: roleId,
        declinedMemberId: scheduleRole.memberId,
        roleName: _roleName,
        groupId: _groupId,
      }).then(async () => {
        // Após substituição, notificar líderes sobre quem assumiu o papel
        try {
          const replacement = await prisma.scheduleRole.findFirst({
            where: {
              scheduleId: _scheduleId,
              role: _roleName,
              status: "PENDING",
              memberId: { not: scheduleRole.memberId },
            },
            include: { member: { select: { name: true } } },
          });
          if (replacement?.member?.name) {
            const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
            const sched = await prisma.schedule.findUnique({
              where: { id: _scheduleId },
              include: { group: { include: { users: { where: { role: { in: ["ADMIN", "LEADER"] } }, select: { email: true, name: true } } } } },
            });
            if (sched?.group) {
              for (const admin of sched.group.users) {
                if (!admin.email) continue;
                await sendSmtpMail({
                  to: admin.email,
                  subject: `🔄 Substituto automático: ${replacement.member.name} assumiu ${_roleName}`,
                  html: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:500px">
                    <p>Olá, <strong>${admin.name ?? "Líder"}</strong>!</p>
                    <p>Como <strong>${scheduleRole.member?.name ?? "um membro"}</strong> recusou a escala como <strong>${_roleName}</strong>, o sistema encontrou automaticamente um substituto:</p>
                    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin:16px 0">
                      <p style="margin:0;font-size:16px">🎵 <strong>${replacement.member.name}</strong> foi adicionado como <strong>${_roleName}</strong></p>
                      <p style="margin:4px 0 0;font-size:13px;color:#666">Status: Aguardando confirmação</p>
                    </div>
                    <p style="font-size:13px;color:#666">Você pode acompanhar a escala no painel do Líder Web.</p>
                  </div>`,
                  fromEmail,
                  fromName: "Líder Web",
                }).catch(() => {});
              }
            }
          }
        } catch (e) {
          console.warn("[respond] erro ao notificar substituto:", e);
        }
      }).catch(() => {});
    }
    // ─────────────────────────────────────────────────────────────────────

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
      metadata: { roleId, status, roleName: scheduleRole.role, declineReason: declineReason ?? null, declineNote: declineNote ?? null },
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
                select: { id: true, name: true, email: true, role: true },
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
        const statusLabel = status === "ACCEPTED" ? "confirmou" : "recusou";
        const emoji = status === "ACCEPTED" ? "✅" : "❌";
        const declineInfo = status === "DECLINED" && declineReason
          ? `\nMotivo: ${declineReason}${declineNote ? ` — ${declineNote}` : ""}`
          : "";

        const adminIds: string[] = [];
        for (const admin of schedule.group.users) {
          if (!admin.email || admin.email === user.email) continue;
          adminIds.push((admin as any).id);
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

        // Push para os líderes
        if (adminIds.length > 0) {
          const allowedAdminIds = await filterUsersByNotifPref(adminIds, "schedule_pending_push").catch(() => adminIds);
          const tokens = await getPushTokensForUsers(allowedAdminIds);
          if (tokens.length > 0) {
            const scheduleDate = new Date(schedule.date).toLocaleDateString("pt-BR");
            await sendPushToMany(tokens, {
              title: `${emoji} ${memberName} ${statusLabel} a escala`,
              body: status === "DECLINED" && declineReason
                ? `${roleLabel} — ${declineReason}${declineNote ? ": " + declineNote.substring(0, 50) : ""}`
                : `${roleLabel} — culto de ${scheduleDate} (${groupName})`,
              data: { url: "/schedules", type: "schedule_response" },
            }).catch(() => {});
          }
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
