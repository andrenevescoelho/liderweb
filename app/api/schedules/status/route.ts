export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";
import { sendPushToMany, getPushTokensForUsers, getPushTokensForGroup } from "@/lib/push-notifications";
import { userWantsNotification, filterUsersByNotifPref } from "@/lib/notification-prefs";

const APP_URL  = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER  ?? "liderweb@multitrackgospel.com";

function canManageSchedule(role: string) {
  return ["SUPERADMIN", "ADMIN", "LEADER"].includes(role);
}

function buildDeadline(scheduleDate: Date, deadlineDays: number): Date {
  const d = new Date(scheduleDate);
  d.setDate(d.getDate() - deadlineDays);
  return d;
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { scheduleId, action, songs, reviewMinisterId, reviewApprovalMode } = await req.json();
  if (!scheduleId || !action)
    return NextResponse.json({ error: "scheduleId e action são obrigatórios" }, { status: 400 });

  const schedule = await (prisma.schedule as any).findUnique({
    where: { id: scheduleId },
    include: {
      group: { select: { name: true, scheduleApprovalDeadlineDays: true } },
      setlist: { include: { items: { include: { song: true }, orderBy: { order: "asc" } } } },
      roles: { include: { member: { select: { id: true, name: true, email: true } } } },
      memberRoles: { include: { member: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!schedule) return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
  if (user.role !== "SUPERADMIN" && schedule.groupId !== user.groupId)
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const scheduleDate = new Date(schedule.date).toLocaleDateString("pt-BR");
  const deadlineDays = schedule.group?.scheduleApprovalDeadlineDays ?? 1;

  const songsList = () =>
    (schedule.setlist?.items ?? [])
      .map((i: any) =>
        `<li style="padding:4px 0;color:#475569;">${i.song?.title ?? ""}${i.song?.artist ? ` — ${i.song.artist}` : ""}${i.selectedKey ? ` [${i.selectedKey}]` : ""}</li>`
      ).join("") || "<li style='color:#94a3b8;'>Nenhuma música selecionada ainda</li>";

  const notifyMembers = async () => {
    const allMembers = new Map<string, { name: string; email: string }>();
    [...(schedule.roles ?? []), ...(schedule.memberRoles ?? [])].forEach((r: any) => {
      if (r.member?.email && r.memberId)
        allMembers.set(r.memberId, { name: r.member.name ?? "", email: r.member.email });
    });

    const memberIds = [...allMembers.keys()];

    // Filtrar quem quer email de escala publicada
    const emailIds = await filterUsersByNotifPref(memberIds, "schedule_published_email");
    for (const [memberId, member] of allMembers) {
      if (!emailIds.includes(memberId)) continue;
      await sendSmtpMail({
        to: member.email,
        subject: `📅 Escala do dia ${scheduleDate} publicada — ${schedule.group?.name}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <p>Olá, <strong>${member.name}</strong>!</p>
          <p style="color:#64748b;">A escala de <strong>${scheduleDate}</strong> foi publicada.</p>
          <div style="text-align:center;margin:20px 0;">
            <a href="${APP_URL}/schedules" style="background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Ver escala</a>
          </div>
        </div>`,
        fromEmail: FROM_EMAIL,
        fromName: "Líder Web",
      }).catch(() => {});
    }

    // Push notification — filtrar quem quer push de escala publicada
    const pushIds = await filterUsersByNotifPref(memberIds, "schedule_published_push");
    const tokens = await getPushTokensForUsers(pushIds);
    if (tokens.length > 0) {
      await sendPushToMany(tokens, {
        title: "📅 Escala publicada!",
        body: `A escala de ${scheduleDate} do ${schedule.group?.name} foi publicada.`,
        data: { url: "/schedules", type: "schedule_published" },
      });
    }

    return allMembers.size;
  };

  const notifyLeaders = async (subject: string, html: string, pushTitle?: string, pushBody?: string, emailPrefKey = "schedule_approved_email", pushPrefKey = "schedule_approved_push") => {
    if (!schedule.groupId) return;
    const leaders = await prisma.user.findMany({
      where: { groupId: schedule.groupId, role: { in: ["ADMIN", "LEADER"] } },
      select: { id: true, name: true, email: true },
    });

    const leaderIds = leaders.map((l) => l.id);
    const emailIds = await filterUsersByNotifPref(leaderIds, emailPrefKey);
    for (const l of leaders) {
      if (!l.email || !emailIds.includes(l.id)) continue;
      await sendSmtpMail({
        to: l.email,
        subject,
        html: html.replace(/\{\{name\}\}/g, l.name ?? "Líder"),
        fromEmail: FROM_EMAIL,
        fromName: "Líder Web",
      }).catch(() => {});
    }

    // Push para líderes com app
    if (pushTitle && pushBody) {
      const pushIds = await filterUsersByNotifPref(leaderIds, pushPrefKey);
      const tokens = await getPushTokensForUsers(pushIds);
      if (tokens.length > 0) {
        await sendPushToMany(tokens, {
          title: pushTitle,
          body: pushBody,
          data: { url: "/schedules", type: "schedule_update" },
        });
      }
    }
  };

  switch (action) {

    // ── DRAFT → PUBLISHED (publica direto, sem revisão) ─────────────────────
    case "publish_now": {
      if (!canManageSchedule(user.role))
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      if (schedule.status === "PUBLISHED")
        return NextResponse.json({ error: "Escala já está publicada" }, { status: 400 });
      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: user.id },
      });
      const count = await notifyMembers();
      return NextResponse.json({ status: "PUBLISHED", message: `Escala publicada! ${count} membro(s) notificado(s)` });
    }

    // ── DRAFT → PENDING_APPROVAL (envia para ministro revisar) ────────────
    case "submit_for_review": {
      if (!canManageSchedule(user.role))
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      if (!["DRAFT", "REVIEW_TIMEOUT"].includes(schedule.status))
        return NextResponse.json({ error: "Escala não pode ser enviada para revisão neste status" }, { status: 400 });
      if (!reviewMinisterId)
        return NextResponse.json({ error: "Selecione o ministro responsável pela revisão" }, { status: 400 });
      if (!["RETURN_TO_LEADER", "AUTO_PUBLISH"].includes(reviewApprovalMode ?? ""))
        return NextResponse.json({ error: "reviewApprovalMode inválido" }, { status: 400 });

      const minister = await prisma.user.findUnique({
        where: { id: reviewMinisterId },
        select: { id: true, name: true, email: true, groupId: true },
      });
      if (!minister || minister.groupId !== schedule.groupId)
        return NextResponse.json({ error: "Ministro não encontrado neste grupo" }, { status: 404 });

      const timeout = buildDeadline(new Date(schedule.date), deadlineDays);

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: {
          status: "PENDING_APPROVAL",
          reviewMinisterId,
          reviewApprovalMode,
          sentToReviewAt: new Date(),
          reviewTimeoutAt: timeout,
          ministerApprovedAt: null,
          approvedAt: null,
          approvedBy: null,
        },
      });

      const deadlineStr = timeout.toLocaleDateString("pt-BR");
      const modeLabel = reviewApprovalMode === "AUTO_PUBLISH"
        ? "Após sua aprovação, a escala será <strong>publicada automaticamente</strong> para toda a equipe."
        : "Após sua aprovação, o líder será notificado para revisar e publicar.";

      if (minister.email) {
        const wantsEmail = await userWantsNotification(minister.id, "schedule_approved_email");
        if (wantsEmail) await sendSmtpMail({
          to: minister.email,
          subject: `🎵 Revise as músicas do culto de ${scheduleDate} — ${schedule.group?.name}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px;border-radius:12px 12px 0 0;">
              <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;">Líder Web · ${schedule.group?.name}</p>
              <p style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">Revise as músicas do culto</p>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
              <p style="color:#1e293b;">Olá, <strong>${minister.name}</strong>!</p>
              <p style="color:#64748b;">Você foi escolhido para revisar o repertório do culto de <strong>${scheduleDate}</strong>.</p>
              <div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
                <p style="margin:0 0 8px;font-weight:600;color:#1e293b;">🎵 Músicas selecionadas:</p>
                <ol style="margin:0;padding-left:20px;">${songsList()}</ol>
              </div>
              <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px;margin-bottom:16px;">
                <p style="margin:0;color:#92400e;font-size:14px;">⏰ <strong>Prazo:</strong> até <strong>${deadlineStr}</strong>.<br>${modeLabel}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${APP_URL}/schedules/review?id=${scheduleId}" style="background:#7c3aed;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:700;">Revisar e aprovar músicas →</a>
              </div>
            </div>
          </div>`,
          fromEmail: FROM_EMAIL,
          fromName: "Líder Web",
        }).catch(() => {});
      }

      // Push para o ministro
      const wantsPush = await userWantsNotification(minister.id, "schedule_approved_push");
      const ministerTokens = wantsPush ? await getPushTokensForUsers([minister.id]) : [];
      if (ministerTokens.length > 0) {
        await sendPushToMany(ministerTokens, {
          title: "🎵 Revisão de músicas necessária",
          body: `Culto de ${scheduleDate} — ${schedule.group?.name}. Toque para revisar.`,
          data: { url: `/schedules/review?id=${scheduleId}`, type: "schedule_review" },
        });
      }

      return NextResponse.json({
        status: "PENDING_APPROVAL",
        message: `Escala enviada para ${minister.name} revisar. Prazo: ${deadlineStr}`,
      });
    }

    // ── PENDING_APPROVAL → APPROVED ou PUBLISHED (ministro aprova) ────────
    case "approve": {
      if (schedule.status !== "PENDING_APPROVAL")
        return NextResponse.json({ error: "Escala não está aguardando aprovação" }, { status: 400 });

      const isDesignatedMinister = schedule.reviewMinisterId === user.id;
      const isMinisterByRole = [...(schedule.roles ?? []), ...(schedule.memberRoles ?? [])].some(
        (r: any) => r.role?.toLowerCase().includes("ministro") && r.memberId === user.id
      );
      if (!isDesignatedMinister && !isMinisterByRole && !canManageSchedule(user.role))
        return NextResponse.json({ error: "Sem permissão para aprovar esta escala" }, { status: 403 });

      // Salvar edições de músicas do ministro
      if (songs && Array.isArray(songs) && songs.length > 0 && schedule.setlistId) {
        await (prisma as any).setlistItem?.deleteMany?.({ where: { setlistId: schedule.setlistId } }).catch(() => {});
        for (let i = 0; i < songs.length; i++) {
          await (prisma as any).setlistItem?.create?.({
            data: { setlistId: schedule.setlistId, songId: songs[i].id, selectedKey: songs[i].key ?? null, order: i },
          }).catch(() => {});
        }
      }

      // Marcar ministro como ACCEPTED automaticamente — ele revisou, logo confirmou presença
      // Atualiza tanto ScheduleRole quanto ScaleMemberRole
      await prisma.scheduleRole.updateMany({
        where: {
          scheduleId,
          memberId: user.id,
          status: "PENDING",
        },
        data: { status: "ACCEPTED" },
      }).catch(() => {});

      await (prisma as any).scaleMemberRole?.updateMany?.({
        where: {
          scaleId: scheduleId,
          memberId: user.id,
          status: "PENDING",
        },
        data: { status: "ACCEPTED" },
      }).catch(() => {});

      const mode = schedule.reviewApprovalMode ?? "RETURN_TO_LEADER";

      if (mode === "AUTO_PUBLISH") {
        await (prisma.schedule as any).update({
          where: { id: scheduleId },
          data: {
            status: "PUBLISHED",
            ministerApprovedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: user.id,
            publishedAt: new Date(),
            publishedBy: "auto_after_minister",
          },
        });
        const count = await notifyMembers();
        return NextResponse.json({
          status: "PUBLISHED",
          message: `Aprovado e publicado automaticamente! ${count} membro(s) notificado(s)`,
        });
      }

      // RETURN_TO_LEADER
      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "APPROVED", ministerApprovedAt: new Date(), approvedAt: new Date(), approvedBy: user.id },
      });

      await notifyLeaders(
        `✅ Escala de ${scheduleDate} aprovada pelo ministro — ${schedule.group?.name}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <p>Olá, <strong>{{name}}</strong>!</p>
          <p style="color:#64748b;">O ministro <strong>${user.name}</strong> aprovou as músicas da escala de <strong>${scheduleDate}</strong>.</p>
          <p style="color:#64748b;">Agora você pode publicá-la para notificar toda a equipe.</p>
          <div style="text-align:center;margin:20px 0;">
            <a href="${APP_URL}/schedules" style="background:#22c55e;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Publicar escala →</a>
          </div>
        </div>`,
        "✅ Escala aprovada!",
        `O ministro ${user.name} aprovou o repertório do culto de ${scheduleDate}. Publique agora!`
      );
      return NextResponse.json({ status: "APPROVED", message: "Músicas aprovadas! Líderes notificados para publicar." });
    }

    // ── APPROVED / REVIEW_TIMEOUT → PUBLISHED (líder publica) ────────────
    case "publish": {
      if (!canManageSchedule(user.role))
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      if (schedule.status === "PUBLISHED")
        return NextResponse.json({ error: "Escala já está publicada" }, { status: 400 });
      if (!["APPROVED", "REVIEW_TIMEOUT", "DRAFT"].includes(schedule.status))
        return NextResponse.json({ error: "Escala não pode ser publicada neste status" }, { status: 400 });

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: user.id },
      });
      const count = await notifyMembers();
      return NextResponse.json({ status: "PUBLISHED", message: `Escala publicada! ${count} membro(s) notificado(s)` });
    }

    // ── qualquer → DRAFT ──────────────────────────────────────────────────
    case "revert": {
      if (!canManageSchedule(user.role))
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: {
          status: "DRAFT",
          reviewMinisterId: null,
          reviewApprovalMode: null,
          sentToReviewAt: null,
          reviewTimeoutAt: null,
          ministerApprovedAt: null,
          approvedAt: null,
          approvedBy: null,
        },
      });
      return NextResponse.json({ status: "DRAFT", message: "Escala voltou para rascunho" });
    }

    // ── PENDING_APPROVAL → REVIEW_TIMEOUT (chamado pelo n8n) ──────────────
    case "timeout": {
      if (schedule.status !== "PENDING_APPROVAL")
        return NextResponse.json({ error: "Escala não está em revisão" }, { status: 400 });
      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "REVIEW_TIMEOUT" },
      });
      await notifyLeaders(
        `⚠️ Prazo de revisão vencido — escala de ${scheduleDate} — ${schedule.group?.name}`,
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <p>Olá, <strong>{{name}}</strong>!</p>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;margin:16px 0;">
            <p style="margin:0;color:#991b1b;">⚠️ O prazo para o ministro aprovar a escala de <strong>${scheduleDate}</strong> venceu sem resposta.</p>
          </div>
          <p style="color:#64748b;">Você pode publicá-la manualmente agora.</p>
          <div style="text-align:center;margin:20px 0;">
            <a href="${APP_URL}/schedules" style="background:#f59e0b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Publicar manualmente →</a>
          </div>
        </div>`,
        "⚠️ Prazo de revisão vencido",
        `O ministro não aprovou a escala de ${scheduleDate} a tempo. Publique manualmente.`
      );
      return NextResponse.json({ status: "REVIEW_TIMEOUT", message: "Escala marcada como REVIEW_TIMEOUT. Líder notificado." });
    }

    default:
      return NextResponse.json({ error: `Action inválida: ${action}` }, { status: 400 });
  }
}
