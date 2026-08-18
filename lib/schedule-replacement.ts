/**
 * Substituição automática de membro em escala após DECLINED.
 *
 * Fluxo:
 *  1. Identificar papel recusado e dia da semana da escala
 *  2. Buscar membros habilitados para o mesmo papel (MemberFunction → RoleFunction.name)
 *  3. Excluir: já está na escala atual, já recusou essa vaga antes
 *  4. Se >2 candidatos: excluir quem estava na escala anterior/próxima do mesmo dia da semana
 *  5. Selecionar o membro que está há mais tempo sem participar naquele papel
 *  6. Inserir como PENDING e disparar email + push (reutilizando fluxo existente)
 *  7. Se o substituto também recusar, repetir excluindo quem já recusou
 */

import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";
import { scheduleCreatedEmail } from "@/lib/email-templates";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";
import { sendPushToMany, getPushTokensForUsers } from "@/lib/push-notifications";
import { filterUsersByNotifPref } from "@/lib/notification-prefs";
import { isEmailEnabled } from "@/lib/email-config";

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface ReplacementContext {
  scheduleId: string;
  scheduleRoleId: string; // ScheduleRole.id que foi recusado
  declinedMemberId: string;
  roleName: string;       // ex: "Bateria"
  groupId: string;
}

interface Candidate {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  lastParticipatedAt: Date | null; // para ordenar por mais tempo sem participar
}

// ─── Função principal ────────────────────────────────────────────────────────

/**
 * Chamada logo após um DECLINED ser persistido.
 * Fire-and-forget: nunca lança exceção para o caller.
 */
export async function handleScheduleDecline(ctx: ReplacementContext): Promise<void> {
  try {
    await _assignAutomaticReplacement(ctx);
  } catch (err) {
    console.error("[schedule-replacement] Erro inesperado:", err);
  }
}

// ─── Implementação ───────────────────────────────────────────────────────────

async function _assignAutomaticReplacement(ctx: ReplacementContext): Promise<void> {
  const { scheduleId, scheduleRoleId, declinedMemberId, roleName, groupId } = ctx;

  // Verificar concorrência: buscar se já existe um substituto PENDING para esse papel
  // (o role original foi deletado ao recusar, então não existe mais)
  const alreadyReplaced = await prisma.scheduleRole.findFirst({
    where: {
      scheduleId,
      role: { equals: roleName, mode: "insensitive" },
      status: "PENDING",
      memberId: { not: declinedMemberId },
    },
  });
  if (alreadyReplaced) {
    console.log(`[schedule-replacement] Vaga ${scheduleRoleId} já tem substituto: ${alreadyReplaced.memberId}`);
    return;
  }

  // Buscar dados da escala
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      roles: { select: { memberId: true, status: true, role: true } },
      group: { select: { name: true } },
    },
  });
  if (!schedule) return;

  const scheduleDate = new Date(schedule.date);
  const dayOfWeek = scheduleDate.getDay(); // 0=Dom ... 6=Sáb
  const groupName = schedule.group?.name ?? "Ministério";

  // IDs já na escala atual (membros que ainda estão na escala — recusados foram deletados)
  const membersInSchedule = new Set(
    schedule.roles
      .filter((r) => r.memberId)
      .map((r) => r.memberId as string)
  );

  // IDs que já recusaram essa vaga específica
  // Como ao recusar o ScheduleRole é deletado, buscamos via audit log
  const declinedLogs = await prisma.auditLog.findMany({
    where: {
      entityId: scheduleId,
      action: "SCALE_DECLINED",
      userId: { not: null },
    },
    select: { userId: true },
  });
  const alreadyDeclined = new Set(declinedLogs.map((l) => l.userId as string));
  alreadyDeclined.add(declinedMemberId);

  // Buscar todos os membros habilitados para o papel (case-insensitive)
  const eligible = await _findEligibleMembers(groupId, roleName);

  if (eligible.length === 0) {
    await _auditNoCandidate(scheduleId, roleName, groupId, "Nenhum membro habilitado para o papel.");
    return;
  }

  // Aplicar exclusões básicas
  const baseFiltered = eligible.filter(
    (c) => !alreadyDeclined.has(c.memberId) && !membersInSchedule.has(c.memberId)
  );

  if (baseFiltered.length === 0) {
    await _auditNoCandidate(scheduleId, roleName, groupId, "Todos os candidatos já participam da escala ou já recusaram.");
    return;
  }

  // Regra 4: se só 2 membros habilitados, não aplicar restrição anterior/próxima
  let candidates: Candidate[];
  if (eligible.length <= 2) {
    console.log(`[schedule-replacement] Somente ${eligible.length} membro(s) no papel "${roleName}" — ignorando restrição de escalas adjacentes.`);
    candidates = baseFiltered;
  } else {
    // Buscar escalas anterior e próxima do mesmo dia da semana
    const [prevScheduleIds, nextScheduleIds] = await Promise.all([
      _getAdjacentScheduleIds(groupId, scheduleDate, dayOfWeek, "prev"),
      _getAdjacentScheduleIds(groupId, scheduleDate, dayOfWeek, "next"),
    ]);

    // IDs de membros nas escalas adjacentes com o mesmo papel
    const membersInPrev = await _getMembersInSchedules(prevScheduleIds, roleName);
    const membersInNext = await _getMembersInSchedules(nextScheduleIds, roleName);

    candidates = baseFiltered.filter(
      (c) => !membersInPrev.has(c.memberId) && !membersInNext.has(c.memberId)
    );

    // Se restrição eliminou todos, volta para baseFiltered
    if (candidates.length === 0) {
      console.log(`[schedule-replacement] Restrição de escalas adjacentes eliminou todos os candidatos — relaxando para escala atual apenas.`);
      candidates = baseFiltered;
    }
  }

  // Ordenar pelo mais tempo sem participar no papel (melhor distribuição)
  candidates.sort((a, b) => {
    if (!a.lastParticipatedAt && !b.lastParticipatedAt) return 0;
    if (!a.lastParticipatedAt) return -1; // nunca participou → prioridade
    if (!b.lastParticipatedAt) return 1;
    return a.lastParticipatedAt.getTime() - b.lastParticipatedAt.getTime();
  });

  const chosen = candidates[0];
  if (!chosen) {
    await _auditNoCandidate(scheduleId, roleName, groupId, "Nenhum candidato válido após aplicar todas as regras.");
    return;
  }

  // Inserir substituto com status PENDING (verificação de concorrência via upsert)
  console.log(`[schedule-replacement] Selecionando ${chosen.memberName} para ${roleName} na escala ${scheduleId}`);

  // Verificar novamente se ainda não tem substituto (concorrência antes de inserir)
  const roleCheckAgain = await prisma.scheduleRole.findFirst({
    where: {
      scheduleId,
      role: { equals: roleName, mode: "insensitive" },
      status: "PENDING",
      memberId: { not: declinedMemberId },
    },
  });
  if (roleCheckAgain) {
    console.log(`[schedule-replacement] Substituto já foi inserido por outra requisição.`);
    return;
  }

  // Criar nova entrada na escala para o substituto
  const newRole = await prisma.scheduleRole.create({
    data: {
      scheduleId,
      role: roleName,
      memberId: chosen.memberId,
      status: "PENDING",
    },
  });

  console.log(`[schedule-replacement] ScheduleRole criado: ${newRole.id} para ${chosen.memberName}`);

  // Auditoria
  await logUserAction({
    userId: chosen.memberId,
    groupId,
    action: AUDIT_ACTIONS.SCALE_CREATED,
    entityType: AuditEntityType.SCALE,
    entityId: scheduleId,
    entityName: `Escala ${scheduleId}`,
    description: `Substituto automático: ${chosen.memberName} adicionado como ${roleName} após recusa de membro anterior.`,
    metadata: { replacementFor: declinedMemberId, newRoleId: newRole.id },
  }).catch(() => {});

  // Notificar o substituto (email + push) reutilizando fluxo existente
  await _notifyReplacement({
    memberId: chosen.memberId,
    memberName: chosen.memberName,
    memberEmail: chosen.memberEmail,
    schedule,
    roleName,
    groupName,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Busca membros ativos habilitados para o papel (match por nome, case-insensitive) */
async function _findEligibleMembers(groupId: string, roleName: string): Promise<Candidate[]> {
  // Buscar RoleFunction pelo nome
  const roleFunction = await prisma.roleFunction.findFirst({
    where: {
      groupId,
      name: { equals: roleName, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (!roleFunction) {
    console.log(`[schedule-replacement] RoleFunction "${roleName}" não encontrada para grupo ${groupId}`);
    return [];
  }

  // Buscar membros com essa função aprovada e ativos
  const memberFunctions = await prisma.memberFunction.findMany({
    where: {
      roleFunctionId: roleFunction.id,
      isPending: false,
      member: {
        groupId,
        profile: { active: true },
      },
    },
    include: {
      member: {
        select: {
          id: true,
          name: true,
          email: true,
          profile: { select: { active: true } },
        },
      },
    },
  });

  // Para cada candidato, buscar a última participação nesse papel
  const candidates: Candidate[] = [];
  for (const mf of memberFunctions) {
    const lastRole = await prisma.scheduleRole.findFirst({
      where: {
        memberId: mf.member.id,
        role: { equals: roleName, mode: "insensitive" },
        status: "ACCEPTED",
        schedule: { groupId },
      },
      orderBy: { schedule: { date: "desc" } },
      include: { schedule: { select: { date: true } } },
    });

    candidates.push({
      memberId: mf.member.id,
      memberName: mf.member.name ?? "Membro",
      memberEmail: mf.member.email,
      lastParticipatedAt: lastRole?.schedule?.date ?? null,
    });
  }

  return candidates;
}

/** Retorna IDs das escalas do mesmo dia da semana (anterior ou próxima) */
async function _getAdjacentScheduleIds(
  groupId: string,
  scheduleDate: Date,
  dayOfWeek: number,
  direction: "prev" | "next"
): Promise<string[]> {
  const schedules = await prisma.schedule.findMany({
    where: {
      groupId,
      date: direction === "prev"
        ? { lt: scheduleDate }
        : { gt: scheduleDate },
    },
    orderBy: { date: direction === "prev" ? "desc" : "asc" },
    take: 10, // pegar algumas para filtrar pelo dia da semana
    select: { id: true, date: true },
  });

  // Filtrar pelo mesmo dia da semana
  const matching = schedules.filter(
    (s) => new Date(s.date).getDay() === dayOfWeek
  );

  // Retornar só a mais próxima
  return matching.slice(0, 1).map((s) => s.id);
}

/** Retorna IDs de membros nas escalas especificadas com o mesmo papel */
async function _getMembersInSchedules(scheduleIds: string[], roleName: string): Promise<Set<string>> {
  if (scheduleIds.length === 0) return new Set();

  const roles = await prisma.scheduleRole.findMany({
    where: {
      scheduleId: { in: scheduleIds },
      role: { equals: roleName, mode: "insensitive" },
      memberId: { not: null },
      status: { not: "DECLINED" },
    },
    select: { memberId: true },
  });

  return new Set(roles.map((r) => r.memberId as string));
}

/** Envia email + push para o substituto reutilizando templates existentes */
async function _notifyReplacement(params: {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  schedule: any;
  roleName: string;
  groupName: string;
}) {
  const { memberId, memberName, memberEmail, schedule, roleName, groupName } = params;

  try {
    const emailEnabled = await isEmailEnabled("schedule_created").catch(() => true);

    if (emailEnabled && memberEmail) {
      const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
      const songs = schedule.setlist?.items?.map((i: any) => ({
        title: i.song?.title ?? i.title ?? "",
        artist: i.song?.artist ?? null,
      })) ?? [];

      const allMembers = (schedule.roles ?? [])
        .filter((r: any) => r.member?.name && r.status !== "DECLINED")
        .map((r: any) => ({ name: r.member.name, role: r.role ?? "" }));

      const { subject, html } = scheduleCreatedEmail({
        memberName,
        groupName,
        scheduleName: schedule.name ?? "Escala",
        scheduleDate: schedule.date,
        scheduleTime: null,
        memberRole: roleName,
        songs,
        otherMembers: allMembers.filter((m: any) => m.name !== memberName),
        scheduleId: schedule.id,
      });

      await sendSmtpMail({
        to: memberEmail,
        subject: `🔄 ${subject}`,
        html,
        fromEmail,
        fromName: "Líder Web",
      }).catch((err) => console.warn("[schedule-replacement] email falhou:", err));
    }

    // Push
    const allowedIds = await filterUsersByNotifPref([memberId], "schedule_pending_push").catch(() => [memberId]);
    const tokens = await getPushTokensForUsers(allowedIds);
    if (tokens.length > 0) {
      const dateStr = new Date(schedule.date).toLocaleDateString("pt-BR");
      await sendPushToMany(tokens, {
        title: `📅 Você foi escalado como ${roleName}`,
        body: `${schedule.name ?? "Escala"} — ${dateStr} (${groupName})`,
        data: { url: "/schedules", type: "schedule_replacement" },
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[schedule-replacement] Erro ao notificar:", err);
  }
}

/** Registra auditoria quando nenhum candidato é encontrado */
async function _auditNoCandidate(
  scheduleId: string,
  roleName: string,
  groupId: string,
  reason: string
): Promise<void> {
  console.log(`[schedule-replacement] Nenhum substituto para ${roleName} na escala ${scheduleId}: ${reason}`);
  await logUserAction({
    userId: null,
    groupId,
    action: AUDIT_ACTIONS.SCALE_DECLINED,
    entityType: AuditEntityType.SCALE,
    entityId: scheduleId,
    description: `Nenhum substituto automático encontrado para o papel "${roleName}": ${reason}`,
    metadata: { roleName, reason },
  }).catch(() => {});
}
