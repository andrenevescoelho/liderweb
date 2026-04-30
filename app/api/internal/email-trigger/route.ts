export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidInternalRequest, unauthorizedResponse } from "@/lib/internal-auth";
import { sendSmtpMail } from "@/lib/smtp";
import {
  welcomeGroupEmail,
  inactiveGroupEmail,
  noSubscriptionEmail,
  noGroupUserEmail,
} from "@/lib/email-templates";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";

// Buscar template personalizado do banco, ou usar o padrão da lib
async function getTemplate(type: string, defaultFn: () => { subject: string; html: string }): Promise<{ subject: string; html: string }> {
  try {
    const saved = await (prisma as any).emailTemplate.findUnique({ where: { type } });
    if (saved) {
      return { subject: saved.subject, html: saved.htmlBody };
    }
  } catch {
    // Usar padrão se falhar
  }
  return defaultFn();
}

function applyVars(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\{\{${k}\}\}`, "gi"), v),
    text
  );
}

// POST /api/internal/email-trigger
// Body: { type: "inactive_7d" | "inactive_15d" | "no_subscription" | "no_group_user" | "welcome_group", targetId?: string }
// Chamado pelo n8n via cron ou manualmente

export async function POST(req: NextRequest) {
  if (!isValidInternalRequest(req)) return unauthorizedResponse();

  const body = await req.json().catch(() => ({}));
  const { type, targetId, dryRun = false } = body;

  const validTypes = ["inactive_7d", "inactive_15d", "no_subscription", "no_group_user", "welcome_group"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: `Tipo inválido. Use: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const results = { sent: 0, skipped: 0, failed: 0, targets: [] as string[] };

  try {
    switch (type) {

      // ── Grupos inativos há 7 ou 15 dias ──────────────────────────────────
      case "inactive_7d":
      case "inactive_15d": {
        const days = type === "inactive_7d" ? 7 : 15;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const recentLimit = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);

        // Buscar grupos sem atividade no período
        const groups = await prisma.group.findMany({
          where: {
            active: true,
            updatedAt: { lt: since, gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }, // entre 7/15 e 60 dias
          },
          include: {
            users: {
              where: { role: "ADMIN" },
              select: { id: true, name: true, email: true },
              take: 1,
            },
          },
          ...(targetId ? { where: { id: targetId } } : {}),
        });

        for (const group of groups) {
          const admin = group.users[0];
          if (!admin?.email) { results.skipped++; continue; }

          // Verificar se já enviou este tipo para este grupo
          const already = await (prisma as any).autoEmailLog.findUnique({
            where: { type_targetId: { type, targetId: group.id } },
          });
          if (already) { results.skipped++; continue; }

          if (!dryRun) {
            const { subject, html } = inactiveGroupEmail({
              adminName: admin.name ?? "Líder",
              groupName: group.name,
              daysSinceLastActivity: days,
              appUrl: APP_URL,
            });

            try {
              const vars = { nome: admin.name ?? "Líder", ministerio: group.name, app_url: APP_URL };
              const tmpl = await getTemplate(type, () => inactiveGroupEmail({ adminName: vars.nome, groupName: vars.ministerio, daysSinceLastActivity: days, appUrl: APP_URL }));
              const finalSubject = applyVars(tmpl.subject, vars);
              const finalHtml = applyVars(tmpl.html, vars);
              await sendSmtpMail({ to: admin.email, subject: finalSubject, html: finalHtml, fromEmail: FROM_EMAIL, fromName: "Líder Web" });
              await (prisma as any).autoEmailLog.create({ data: { type, targetId: group.id } });
              results.sent++;
              results.targets.push(group.name);
            } catch {
              results.failed++;
            }
          } else {
            results.targets.push(`${group.name} → ${admin.email}`);
            results.sent++;
          }
        }
        break;
      }

      // ── Grupos sem assinatura ─────────────────────────────────────────────
      case "no_subscription": {
        const groups = await prisma.group.findMany({
          where: {
            active: true,
            ...(targetId ? { id: targetId } : {}),
          },
          include: {
            users: {
              where: { role: "ADMIN" },
              select: { id: true, name: true, email: true },
              take: 1,
            },
          },
        });

        for (const group of groups) {
          const admin = group.users[0];
          if (!admin?.email) { results.skipped++; continue; }

          // Verificar entitlement
          const ent = await (prisma as any).entitlement?.findFirst?.({
            where: { groupId: group.id, isActive: true },
          }).catch(() => null);

          if (ent) { results.skipped++; continue; }

          const already = await (prisma as any).autoEmailLog.findUnique({
            where: { type_targetId: { type, targetId: group.id } },
          });
          if (already) { results.skipped++; continue; }

          if (!dryRun) {
            const { subject, html } = noSubscriptionEmail({
              adminName: admin.name ?? "Líder",
              groupName: group.name,
              appUrl: APP_URL,
            });

            try {
              await sendSmtpMail({ to: admin.email, subject, html, fromEmail: FROM_EMAIL, fromName: "Líder Web" });
              await (prisma as any).autoEmailLog.create({ data: { type, targetId: group.id } });
              results.sent++;
              results.targets.push(group.name);
            } catch {
              results.failed++;
            }
          } else {
            results.targets.push(`${group.name} → ${admin.email}`);
            results.sent++;
          }
        }
        break;
      }

      // ── Usuários sem grupo ────────────────────────────────────────────────
      case "no_group_user": {
        const usersRaw = await prisma.user.findMany({
          where: {
            groupId: null,
            role: { not: "SUPERADMIN" },
            createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            ...(targetId ? { id: targetId } : {}),
          },
          select: { id: true, name: true, email: true },
        });
        // Filtrar usuários sem email após a query (evitar `not: null` que falha no Prisma 6)
        const users = usersRaw.filter((u) => u.email && u.email.trim() !== "");

        for (const user of users) {
          if (!user.email) { results.skipped++; continue; }

          const already = await (prisma as any).autoEmailLog.findUnique({
            where: { type_targetId: { type, targetId: user.id } },
          });
          if (already) { results.skipped++; continue; }

          if (!dryRun) {
            const { subject, html } = noGroupUserEmail({
              userName: user.name ?? "Usuário",
              email: user.email,
              appUrl: APP_URL,
            });

            try {
              await sendSmtpMail({ to: user.email, subject, html, fromEmail: FROM_EMAIL, fromName: "Líder Web" });
              await (prisma as any).autoEmailLog.create({ data: { type, targetId: user.id } });
              results.sent++;
              results.targets.push(user.email);
            } catch {
              results.failed++;
            }
          } else {
            results.targets.push(`${user.name} → ${user.email}`);
            results.sent++;
          }
        }
        break;
      }

      // ── Bem-vindo (reenvio manual para um grupo específico) ───────────────
      case "welcome_group": {
        if (!targetId) {
          return NextResponse.json({ error: "targetId (groupId) é obrigatório para welcome_group" }, { status: 400 });
        }

        const group = await prisma.group.findUnique({
          where: { id: targetId },
          include: {
            users: {
              where: { role: "ADMIN" },
              select: { id: true, name: true, email: true },
              take: 1,
            },
          },
        });

        if (!group || !group.users[0]?.email) {
          return NextResponse.json({ error: "Grupo ou admin não encontrado" }, { status: 404 });
        }

        const admin = group.users[0];
        if (!dryRun) {
          const { subject, html } = welcomeGroupEmail({
            adminName: admin.name ?? "Líder",
            groupName: group.name,
            appUrl: APP_URL,
          });

          await sendSmtpMail({ to: admin.email!, subject, html, fromEmail: FROM_EMAIL, fromName: "Líder Web" });
        }
        results.sent++;
        results.targets.push(`${group.name} → ${admin.email}`);
        break;
      }
    }

    return NextResponse.json({
      type,
      dryRun,
      ...results,
      message: dryRun ? "Simulação — nenhum e-mail foi enviado" : `${results.sent} e-mail(s) enviado(s)`,
    });

  } catch (error: any) {
    console.error("[email-trigger] erro:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
