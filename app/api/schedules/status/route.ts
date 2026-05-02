export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";
const FROM_EMAIL = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";

function canManageSchedule(role: string) {
  return ["SUPERADMIN", "ADMIN", "LEADER"].includes(role);
}

// PATCH /api/schedules/status
// Body: { scheduleId, action: "submit" | "approve" | "reject" | "publish" | "unpublish", songs? }
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { scheduleId, action, songs } = await req.json();

  if (!scheduleId || !action) {
    return NextResponse.json({ error: "scheduleId e action são obrigatórios" }, { status: 400 });
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      group: { select: { name: true } },
      roles: {
        include: { member: { select: { id: true, name: true, email: true } } },
      },
      memberRoles: {
        include: { member: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
  }

  // Verificar se usuário pertence ao grupo
  if (user.role !== "SUPERADMIN" && schedule.groupId !== user.groupId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const scheduleDate = new Date(schedule.date).toLocaleDateString("pt-BR");

  switch (action) {

    // ── DRAFT → PENDING_APPROVAL (líder envia para ministro revisar) ───────────
    case "submit": {
      if (!canManageSchedule(user.role)) {
        return NextResponse.json({ error: "Sem permissão para enviar para aprovação" }, { status: 403 });
      }
      if ((schedule as any).status !== "DRAFT") {
        return NextResponse.json({ error: "Escala já foi enviada para aprovação" }, { status: 400 });
      }

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "PENDING_APPROVAL" },
      });

      // Buscar prazo de aprovação do grupo
      const groupConfig = await prisma.group.findUnique({
        where: { id: schedule.groupId ?? "" },
        select: { scheduleApprovalDeadlineDays: true },
      }).catch(() => null);
      const deadlineDays = (groupConfig as any)?.scheduleApprovalDeadlineDays ?? 1;
      const scheduleDay = new Date(schedule.date);
      const deadlineDate = new Date(scheduleDay);
      deadlineDate.setDate(deadlineDate.getDate() - deadlineDays);
      const deadlineDateStr = deadlineDate.toLocaleDateString("pt-BR");

      // Montar lista de músicas para o e-mail
      const fullSchedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: {
          setlist: {
            include: {
              items: { include: { song: true }, orderBy: { order: "asc" } },
            },
          },
        },
      });
      const songsList = fullSchedule?.setlist?.items?.map((i: any) =>
        `<li style="padding:4px 0;color:#475569;">${i.song?.title ?? ""}${i.song?.artist ? ` <span style="color:#94a3b8;">— ${i.song.artist}</span>` : ""}${i.key ? ` <span style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">${i.key}</span>` : ""}</li>`
      ).join("") ?? "";

      // Notificar ministro(s) do dia por e-mail
      const ministers = [
        ...schedule.roles.filter((r) => r.role?.toLowerCase().includes("ministro") && r.member?.email),
        ...schedule.memberRoles.filter((r) => r.role?.toLowerCase().includes("ministro") && r.member?.email),
      ];

      for (const m of ministers) {
        const email = m.member?.email;
        const name = m.member?.name ?? "Ministro";
        if (!email) continue;

        await sendSmtpMail({
          to: email,
          subject: `🎵 Revise as músicas do culto de ${scheduleDate} — ${schedule.group?.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px;border-radius:12px 12px 0 0;">
                <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;">Líder Web · ${schedule.group?.name}</p>
                <p style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">Revise as músicas do culto</p>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 8px;color:#1e293b;font-size:16px;">Olá, <strong>${name}</strong>!</p>
                <p style="margin:0 0 16px;color:#64748b;">Você foi escalado como <strong>Ministro</strong> no culto de <strong>${scheduleDate}</strong>. As músicas abaixo foram selecionadas para você revisar:</p>
                
                <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:20px;">
                  <p style="margin:0 0 8px;color:#1e293b;font-weight:600;font-size:14px;">🎵 Músicas selecionadas:</p>
                  <ol style="margin:0;padding-left:20px;">${songsList || "<li style='color:#94a3b8;'>Nenhuma música selecionada ainda</li>"}</ol>
                </div>

                <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:14px;margin-bottom:20px;">
                  <p style="margin:0;color:#92400e;font-size:14px;">⏰ <strong>Prazo para aprovação:</strong> até <strong>${deadlineDateStr}</strong> (${deadlineDays} dia${deadlineDays !== 1 ? "s" : ""} antes do culto).<br>Se não houver resposta até essa data, a escala será publicada automaticamente.</p>
                </div>

                <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Clique abaixo para revisar, reordenar as músicas, alterar tons e aprovar:</p>
                
                <div style="text-align:center;margin:24px 0;">
                  <a href="${APP_URL}/schedules/review?id=${scheduleId}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;">Revisar e aprovar músicas →</a>
                </div>
                
                <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;text-align:center;">Líder Web · by multitrackgospel.com</p>
              </div>
            </div>`,
          fromEmail: FROM_EMAIL,
          fromName: "Líder Web",
        }).catch(() => {});
      }

      return NextResponse.json({ status: "PENDING_APPROVAL", message: "Escala enviada para aprovação" });
    }

    // ── PENDING_APPROVAL → APPROVED (ministro aprova, opcionalmente edita músicas) ─
    case "approve": {
      if ((schedule as any).status !== "PENDING_APPROVAL") {
        return NextResponse.json({ error: "Escala não está aguardando aprovação" }, { status: 400 });
      }

      // Verificar se é o ministro do dia ou um admin/leader
      const isMinister = [
        ...schedule.roles,
        ...schedule.memberRoles,
      ].some((r) => r.role?.toLowerCase().includes("ministro") && r.memberId === user.id);

      if (!isMinister && !canManageSchedule(user.role)) {
        return NextResponse.json({ error: "Sem permissão para aprovar esta escala" }, { status: 403 });
      }

      const updateData: any = {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: user.id,
      };

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: updateData,
      });

      // Se enviou músicas atualizadas, atualizar o setlist
      if (songs && Array.isArray(songs) && songs.length > 0 && schedule.setlistId) {
        // Limpar setlist atual e adicionar novas músicas
        await (prisma as any).setlistItem?.deleteMany?.({
          where: { setlistId: schedule.setlistId },
        }).catch(() => {});

        for (let i = 0; i < songs.length; i++) {
          await (prisma as any).setlistItem?.create?.({
            data: {
              setlistId: schedule.setlistId,
              songId: songs[i].id,
              position: i,
              key: songs[i].key ?? null,
            },
          }).catch(() => {});
        }
      }

      // Notificar líder/admin
      if (schedule.groupId) {
        const admins = await prisma.user.findMany({
          where: { groupId: schedule.groupId, role: { in: ["ADMIN", "LEADER"] }, email: { not: null } },
          select: { name: true, email: true },
        });

        for (const admin of admins) {
          if (!admin.email) continue;
          await sendSmtpMail({
            to: admin.email,
            subject: `✅ Escala de ${scheduleDate} aprovada — ${schedule.group?.name}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <p style="color:#1e293b;">Olá, <strong>${admin.name}</strong>!</p>
                <p style="color:#64748b;">A escala do dia <strong>${scheduleDate}</strong> foi aprovada por <strong>${user.name}</strong>.</p>
                <p style="color:#64748b;">Agora você pode publicá-la para notificar toda a equipe.</p>
                <div style="text-align:center;margin:20px 0;">
                  <a href="${APP_URL}/schedules" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Publicar escala</a>
                </div>
              </div>`,
            fromEmail: FROM_EMAIL,
            fromName: "Líder Web",
          }).catch(() => {});
        }
      }

      return NextResponse.json({ status: "APPROVED", message: "Escala aprovada!" });
    }

    // ── APPROVED → PUBLISHED (líder/admin publica e notifica equipe) ──────────
    case "publish": {
      if (!canManageSchedule(user.role)) {
        return NextResponse.json({ error: "Sem permissão para publicar" }, { status: 403 });
      }
      if ((schedule as any).status === "PUBLISHED") {
        return NextResponse.json({ error: "Escala já está publicada" }, { status: 400 });
      }

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: user.id },
      });

      // Notificar toda a equipe
      const allMembers = new Map<string, { name: string; email: string }>();
      [...schedule.roles, ...schedule.memberRoles].forEach((r) => {
        if (r.member?.email && r.memberId) {
          allMembers.set(r.memberId, { name: r.member.name ?? "", email: r.member.email });
        }
      });

      for (const [, member] of allMembers) {
        await sendSmtpMail({
          to: member.email,
          subject: `📅 Escala do dia ${scheduleDate} publicada — ${schedule.group?.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <p style="color:#1e293b;">Olá, <strong>${member.name}</strong>!</p>
              <p style="color:#64748b;">A escala do dia <strong>${scheduleDate}</strong> do ministério <strong>${schedule.group?.name}</strong> foi publicada.</p>
              <p style="color:#64748b;">Confira sua participação e as músicas do culto.</p>
              <div style="text-align:center;margin:20px 0;">
                <a href="${APP_URL}/schedules" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Ver escala</a>
              </div>
            </div>`,
          fromEmail: FROM_EMAIL,
          fromName: "Líder Web",
        }).catch(() => {});
      }

      return NextResponse.json({ status: "PUBLISHED", message: `Escala publicada! ${allMembers.size} membro(s) notificado(s)` });
    }

    // ── Voltar para DRAFT (qualquer status → DRAFT) ───────────────────────────
    case "revert": {
      if (!canManageSchedule(user.role)) {
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
      }

      await (prisma.schedule as any).update({
        where: { id: scheduleId },
        data: { status: "DRAFT", approvedAt: null, approvedBy: null },
      });

      return NextResponse.json({ status: "DRAFT", message: "Escala voltou para rascunho" });
    }

    default:
      return NextResponse.json({ error: "Action inválida" }, { status: 400 });
  }
}
