export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidInternalRequest, unauthorizedResponse } from "@/lib/internal-auth";
import { sendSmtpMail } from "@/lib/smtp";

const APP_URL    = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER   ?? "liderweb@multitrackgospel.com";

// POST /api/internal/review-timeout
// Chamado pelo n8n diariamente.
// Busca escalas PENDING_APPROVAL cujo reviewTimeoutAt já passou,
// marca como REVIEW_TIMEOUT e notifica os líderes.
// Body (opcional): { dryRun: false }

export async function POST(req: NextRequest) {
  if (!isValidInternalRequest(req)) return unauthorizedResponse();

  const { dryRun = false } = await req.json().catch(() => ({}));
  const now = new Date();

  // Buscar escalas em revisão com prazo vencido
  const expired = await (prisma.schedule as any).findMany({
    where: {
      status: "PENDING_APPROVAL",
      reviewTimeoutAt: { lte: now },
    },
    include: {
      group: { select: { name: true, scheduleApprovalDeadlineDays: true } },
    },
    orderBy: { date: "asc" },
  });

  const results: { id: string; groupName: string; date: string; action: string }[] = [];

  for (const schedule of expired) {
    const scheduleDate = new Date(schedule.date).toLocaleDateString("pt-BR");
    const groupName    = schedule.group?.name ?? "—";

    if (!dryRun) {
      // Marcar como REVIEW_TIMEOUT
      await (prisma.schedule as any).update({
        where: { id: schedule.id },
        data: { status: "REVIEW_TIMEOUT" },
      });

      // Notificar líderes/admins do grupo
      if (schedule.groupId) {
        const leaders = await prisma.user.findMany({
          where: {
            groupId: schedule.groupId,
            role: { in: ["ADMIN", "LEADER"] },
            email: { not: null },
          },
          select: { name: true, email: true },
        });

        for (const leader of leaders) {
          if (!leader.email) continue;
          await sendSmtpMail({
            to: leader.email,
            subject: `⚠️ Prazo de revisão vencido — escala de ${scheduleDate} — ${groupName}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <p style="color:#1e293b;">Olá, <strong>${leader.name}</strong>!</p>
              <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin:16px 0;">
                <p style="margin:0;color:#991b1b;">⚠️ O prazo para o ministro aprovar a escala de <strong>${scheduleDate}</strong> do ministério <strong>${groupName}</strong> venceu sem resposta.</p>
              </div>
              <p style="color:#64748b;">Você pode publicar a escala manualmente agora.</p>
              <div style="text-align:center;margin:20px 0;">
                <a href="${APP_URL}/schedules" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Publicar manualmente →</a>
              </div>
            </div>`,
            fromEmail: FROM_EMAIL,
            fromName: "Líder Web",
          }).catch(() => {});
        }
      }
    }

    results.push({
      id: schedule.id,
      groupName,
      date: scheduleDate,
      action: dryRun ? "would_timeout" : "marked_timeout",
    });
  }

  console.log(`[review-timeout] ${dryRun ? "DRY RUN" : "OK"} — ${results.length} escala(s) processada(s)`);

  return NextResponse.json({
    dryRun,
    processed: results.length,
    schedules: results,
    message: dryRun
      ? `Simulação: ${results.length} escala(s) seriam marcadas como REVIEW_TIMEOUT`
      : `${results.length} escala(s) marcadas como REVIEW_TIMEOUT`,
  });
}
