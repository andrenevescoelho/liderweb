export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const scheduleId = req.nextUrl.searchParams.get("id");
  if (!scheduleId) {
    return NextResponse.json({ error: "ID da escala é obrigatório" }, { status: 400 });
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      group: {
        select: {
          name: true,
          scheduleApprovalDeadlineDays: true,
        },
      },
      setlist: {
        include: {
          items: {
            include: { song: true },
            orderBy: { order: "asc" },
          },
        },
      },
      roles: {
        include: {
          member: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
  }

  // Verificar se usuário tem acesso:
  // 1. Ministro designado via reviewMinisterId (novo fluxo)
  // 2. Ministro pelo role na escala (fluxo legado)
  // 3. Admin/Leader do grupo
  const isDesignatedMinister = (schedule as any).reviewMinisterId === user.id;
  const isMinisterByRole = schedule.roles.some(
    (r) => r.role?.toLowerCase().includes("ministro") && r.memberId === user.id
  );
  const isManager = ["SUPERADMIN", "ADMIN", "LEADER"].includes(user.role) &&
    (user.role === "SUPERADMIN" || schedule.groupId === user.groupId);

  if (!isDesignatedMinister && !isMinisterByRole && !isManager) {
    return NextResponse.json({ error: "Sem permissão para revisar esta escala" }, { status: 403 });
  }

  // Calcular data limite para aprovação
  const deadlineDays = (schedule.group as any)?.scheduleApprovalDeadlineDays ?? 1;
  const scheduleDate = new Date(schedule.date);
  const deadlineDate = new Date(scheduleDate);
  deadlineDate.setDate(deadlineDate.getDate() - deadlineDays);

  // Montar resposta
  const songs = schedule.setlist?.items?.map((item: any) => ({
    id: item.song?.id ?? item.songId,
    title: item.song?.title ?? "",
    artist: item.song?.artist ?? null,
    bpm: item.song?.bpm ?? null,
    key: item.selectedKey ?? item.key ?? item.song?.originalKey ?? null,
    originalKey: item.song?.originalKey ?? null,
  })) ?? [];

  const roles = schedule.roles.map((r: any) => ({
    role: r.role,
    memberName: r.member?.name ?? null,
    memberId: r.memberId,
  }));

  const minister = schedule.roles.find((r: any) =>
    r.role?.toLowerCase().includes("ministro")
  );

  return NextResponse.json({
    id: schedule.id,
    date: schedule.date,
    name: schedule.name,
    status: (schedule as any).status ?? "DRAFT",
    reviewApprovalMode: (schedule as any).reviewApprovalMode ?? null,
    group: {
      name: schedule.group?.name ?? "",
      scheduleApprovalDeadlineDays: deadlineDays,
    },
    songs,
    roles,
    ministerName: minister?.member?.name ?? null,
    deadlineDate: deadlineDate.toISOString(),
  });
}
