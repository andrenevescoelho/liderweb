export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: { groupId: string; broadcastId: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { groupId, broadcastId } = params;
    const userInGroup = user.role === "SUPERADMIN" || user.groupId === groupId;

    if (!userInGroup) {
      return NextResponse.json({ error: "Sem permissão para apagar comunicados neste grupo" }, { status: 403 });
    }

    const broadcast = await prisma.groupBroadcast.findUnique({
      where: { id: broadcastId },
      select: { id: true, groupId: true, senderUserId: true },
    });

    if (!broadcast || broadcast.groupId !== groupId) {
      return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });
    }

    const canDelete = user.role === "SUPERADMIN" || (user.role === "ADMIN" && broadcast.senderUserId === user.id);

    if (!canDelete) {
      return NextResponse.json({ error: "Você só pode apagar comunicados enviados por você" }, { status: 403 });
    }

    await prisma.groupBroadcast.delete({ where: { id: broadcastId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete group broadcast error:", error);
    return NextResponse.json({ error: "Erro ao apagar comunicado" }, { status: 500 });
  }
}
