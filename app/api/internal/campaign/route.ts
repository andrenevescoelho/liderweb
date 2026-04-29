export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { isValidInternalRequest } from "@/lib/internal-auth";
import { sendSmtpMail } from "@/lib/smtp";
import { campaignEmail } from "@/lib/email-templates";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";

function isSuperAdmin(user: any) {
  return user?.role === "SUPERADMIN";
}

// ── GET — listar campanhas (superadmin) ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const campaigns = await (prisma as any).emailCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { logs: true } },
    },
  });

  return NextResponse.json(campaigns);
}

// ── POST — criar campanha (superadmin) ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { title, subject, htmlBody, segment, scheduledAt } = body;

  if (!title || !subject || !htmlBody || !segment) {
    return NextResponse.json({ error: "title, subject, htmlBody e segment são obrigatórios" }, { status: 400 });
  }

  const validSegments = ["ALL_ADMINS", "NO_SUBSCRIPTION", "INACTIVE_7D", "INACTIVE_15D", "NO_GROUP"];
  if (!validSegments.includes(segment)) {
    return NextResponse.json({ error: `Segment inválido. Use: ${validSegments.join(", ")}` }, { status: 400 });
  }

  const campaign = await (prisma as any).emailCampaign.create({
    data: {
      title,
      subject,
      htmlBody,
      segment,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      createdBy: (session.user as any).id,
    },
  });

  return NextResponse.json(campaign);
}

// ── PATCH — editar ou disparar campanha ───────────────────────────────────────
export async function PATCH(req: NextRequest) {
  // Aceita tanto superadmin quanto n8n
  const session = await getServerSession(authOptions);
  const isN8n = isValidInternalRequest(req);
  if (!isSuperAdmin(session?.user) && !isN8n) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { id, action, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const campaign = await (prisma as any).emailCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  // Ação de disparo
  if (action === "send") {
    if (campaign.status === "sending") {
      return NextResponse.json({ error: "Campanha já está sendo enviada" }, { status: 400 });
    }

    await (prisma as any).emailCampaign.update({
      where: { id },
      data: { status: "sending" },
    });

    // Buscar destinatários baseado no segmento
    const recipients = await getSegmentRecipients(campaign.segment);

    let sentCount = 0;
    let failCount = 0;

    for (const recipient of recipients) {
      try {
        const { subject, html } = campaignEmail({
          subject: campaign.subject,
          htmlBody: campaign.htmlBody,
          groupName: recipient.groupName ?? "Ministério",
          recipientName: recipient.name ?? "Líder",
          appUrl: APP_URL,
        });

        await sendSmtpMail({
          to: recipient.email,
          subject,
          html,
          fromEmail: FROM_EMAIL,
          fromName: "Líder Web",
        });

        await (prisma as any).emailCampaignLog.create({
          data: { campaignId: id, email: recipient.email, recipientId: recipient.id, status: "sent" },
        });

        sentCount++;
      } catch (err: any) {
        await (prisma as any).emailCampaignLog.create({
          data: { campaignId: id, email: recipient.email, recipientId: recipient.id, status: "failed", error: err.message },
        });
        failCount++;
      }
    }

    const updated = await (prisma as any).emailCampaign.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), sentCount, failCount },
    });

    return NextResponse.json({ ...updated, message: `${sentCount} e-mail(s) enviado(s), ${failCount} falha(s)` });
  }

  // Atualização simples de campos
  const updated = await (prisma as any).emailCampaign.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(updated);
}

// ── DELETE — remover campanha draft ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await req.json();
  const campaign = await (prisma as any).emailCampaign.findUnique({ where: { id } });

  if (!campaign) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (campaign.status === "sent") return NextResponse.json({ error: "Não é possível remover campanha já enviada" }, { status: 400 });

  await (prisma as any).emailCampaign.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

// ── Helper: buscar destinatários por segmento ─────────────────────────────────
async function getSegmentRecipients(segment: string): Promise<{
  id: string; name: string; email: string; groupName?: string;
}[]> {
  switch (segment) {

    case "ALL_ADMINS": {
      const users = await prisma.user.findMany({
        where: { role: "ADMIN", email: { not: null }, groupId: { not: null } },
        include: { group: { select: { name: true } } },
        select: { id: true, name: true, email: true, group: true },
      } as any);
      return users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, groupName: u.group?.name }));
    }

    case "NO_SUBSCRIPTION": {
      const groups = await prisma.group.findMany({
        where: { active: true },
        include: {
          users: { where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, take: 1 },
        },
      });
      const result = [];
      for (const g of groups) {
        const ent = await (prisma as any).entitlement?.findFirst?.({
          where: { groupId: g.id, isActive: true },
        }).catch(() => null);
        if (!ent && g.users[0]?.email) {
          result.push({ id: g.users[0].id, name: g.users[0].name!, email: g.users[0].email!, groupName: g.name });
        }
      }
      return result;
    }

    case "INACTIVE_7D":
    case "INACTIVE_15D": {
      const days = segment === "INACTIVE_7D" ? 7 : 15;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const groups = await prisma.group.findMany({
        where: { active: true, updatedAt: { lt: since } },
        include: {
          users: { where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, take: 1 },
        },
      });
      return groups
        .filter((g) => g.users[0]?.email)
        .map((g) => ({ id: g.users[0].id, name: g.users[0].name!, email: g.users[0].email!, groupName: g.name }));
    }

    case "NO_GROUP": {
      const users = await prisma.user.findMany({
        where: { groupId: null, role: { not: "SUPERADMIN" }, email: { not: null } },
        select: { id: true, name: true, email: true },
      });
      return users.map((u) => ({ id: u.id, name: u.name!, email: u.email! }));
    }

    default:
      return [];
  }
}
