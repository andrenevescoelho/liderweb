export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidInternalRequest, unauthorizedResponse } from "@/lib/internal-auth";
import { sendSmtpMail } from "@/lib/smtp";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";

// POST /api/internal/schedule-autopublish
// Chamado pelo n8n todo dia — verifica escalas PENDING_APPROVAL que passaram do prazo
// e as publica automaticamente notificando a equipe

export async function POST(req: NextRequest) {
  if (!isValidInternalRequest(req)) return unauthorizedResponse();

  const body = await req.json().catch(() => ({}));
  const { dryRun = false } = body;

  const now = new Date();
  const results = { published: 0, skipped: 0, targets: [] as string[] };

  try {
    // Buscar todas as escalas PENDING_APPROVAL com data futura
    const pendingSchedules = await (prisma.schedule as any).findMany({
      where: {
        status: "PENDING_APPROVAL",
        date: { gte: now },
      },
      include: {
        group: { select: { name: true, scheduleApprovalDeadlineDays: true } },
        roles: {
          include: { member: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    for (const schedule of pendingSchedules) {
      const deadlineDays = (schedule.group as any)?.scheduleApprovalDeadlineDays ?? 1;
      const scheduleDate = new Date(schedule.date);
      const deadlineDate = new Date(scheduleDate);
      deadlineDate.setDate(deadlineDate.getDate() - deadlineDays);

      // Verificar se passou do prazo
      if (now < deadlineDate) {
        results.skipped++;
        continue;
      }

      const scheduleDisplayDate = scheduleDate.toLocaleDateString("pt-BR");
      results.targets.push(`${schedule.group?.name} — ${scheduleDisplayDate}`);

      if (!dryRun) {
        // Publicar automaticamente
        await (prisma.schedule as any).update({
          where: { id: schedule.id },
          data: {
            status: "PUBLISHED",
            publishedAt: now,
            publishedBy: "auto",
          },
        });

        // Notificar toda a equipe
        const allMembers = new Map<string, { name: string; email: string }>();
        schedule.roles.forEach((r: any) => {
          if (r.member?.email && r.memberId) {
            allMembers.set(r.memberId, { name: r.member.name ?? "", email: r.member.email });
          }
        });

        for (const [, member] of allMembers) {
          await sendSmtpMail({
            to: member.email,
            subject: `📅 Escala do dia ${scheduleDisplayDate} publicada — ${schedule.group?.name}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <p style="color:#1e293b;">Olá, <strong>${member.name}</strong>!</p>
                <p style="color:#64748b;">A escala do dia <strong>${scheduleDisplayDate}</strong> do ministério <strong>${schedule.group?.name}</strong> foi publicada.</p>
                <p style="color:#64748b;">Confira sua participação e as músicas do culto.</p>
                <div style="text-align:center;margin:20px 0;">
                  <a href="${APP_URL}/schedules" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Ver escala</a>
                </div>
              </div>`,
            fromEmail: FROM_EMAIL,
            fromName: "Líder Web",
          }).catch(() => {});
        }

        results.published++;
      } else {
        results.published++;
      }
    }

    return NextResponse.json({
      dryRun,
      ...results,
      message: dryRun
        ? `Simulação: ${results.published} escala(s) seriam publicadas automaticamente`
        : `${results.published} escala(s) publicada(s) automaticamente`,
    });

  } catch (error: any) {
    console.error("[autopublish] erro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
