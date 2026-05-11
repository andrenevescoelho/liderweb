export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// PATCH /api/schedules/[id]/reorder
// Body: { songIds: string[] } — array de IDs na nova ordem
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const canEdit = ["SUPERADMIN", "ADMIN", "LEADER"].includes(user.role)
      || (user.permissions ?? []).includes("schedule.edit");
    if (!canEdit) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { songIds } = await req.json();
    if (!Array.isArray(songIds)) return NextResponse.json({ error: "songIds inválido" }, { status: 400 });

    const schedule = await prisma.schedule.findUnique({
      where: { id: params.id },
      include: { setlist: { include: { items: true } } },
    });

    if (!schedule) return NextResponse.json({ error: "Escala não encontrada" }, { status: 404 });
    if (!["DRAFT", "APPROVED", "REVIEW_TIMEOUT"].includes(schedule.status)) {
      return NextResponse.json({ error: "Não é possível reordenar uma escala publicada" }, { status: 400 });
    }

    // Atualizar a ordem de cada item
    await Promise.all(
      songIds.map((songId: string, index: number) =>
        (prisma as any).setlistItem.updateMany({
          where: { setlistId: schedule.setlist?.id, songId },
          data: { order: index },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Reorder error:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
