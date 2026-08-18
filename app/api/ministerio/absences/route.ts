export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!["SUPERADMIN", "ADMIN", "LEADER"].includes(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Buscar ausências via audit log (ScheduleRole é deletado ao recusar)
    const declineLogs = await prisma.auditLog.findMany({
      where: {
        groupId: user.groupId,
        action: "SCALE_DECLINED",
        userId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Buscar substitutos automáticos via audit log (SCALE_CREATED com metadata)
    const replacementLogs = await prisma.auditLog.findMany({
      where: {
        groupId: user.groupId,
        action: "SCALE_CREATED",
        description: { contains: "Substituto automático" },
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Indexar substitutos por scheduleId
    const replacementBySchedule: Record<string, any> = {};
    for (const log of replacementLogs) {
      const meta = log.metadata as any;
      if (meta?.replacementFor && log.entityId) {
        const key = `${log.entityId}:${meta.replacementFor}`;
        replacementBySchedule[key] = {
          replacementName: log.user?.name ?? (log.description?.match(/: (.+?) adicionado/)?.[1] ?? ""),
          replacementRole: log.description?.match(/como (.+?) após/)?.[1] ?? "",
          replacementId: log.userId,
        };
      }
    }

    // Buscar dados das escalas referenciadas
    const scheduleIds = [...new Set(declineLogs.map((l) => l.entityId).filter(Boolean) as string[])];
    const schedules = scheduleIds.length > 0 ? await prisma.schedule.findMany({
      where: { id: { in: scheduleIds } },
      select: { id: true, date: true, name: true },
    }) : [];
    const scheduleMap = Object.fromEntries(schedules.map((s) => [s.id, s]));

    const absences = declineLogs.map((log) => {
      const meta = log.metadata as any;
      const schedule = scheduleMap[log.entityId ?? ""];
      const replacementKey = `${log.entityId}:${log.userId}`;
      const replacement = replacementBySchedule[replacementKey];
      return {
        id: log.id,
        memberId: log.userId,
        memberName: log.user?.name ?? meta?.memberName ?? "Membro",
        roleName: meta?.roleName ?? meta?.role ?? "",
        declineReason: meta?.declineReason ?? null,
        declineNote: meta?.declineNote ?? null,
        scheduleDate: schedule?.date ?? log.createdAt,
        scheduleName: schedule?.name ?? null,
        // Substituto automático (se houver)
        replacementName: replacement?.replacementName ?? null,
        replacementRole: replacement?.replacementRole ?? null,
      };
    });

    return NextResponse.json(absences);
  } catch (e) {
    console.error("Absences error:", e);
    return NextResponse.json({ error: "Erro ao buscar ausências" }, { status: 500 });
  }
}
