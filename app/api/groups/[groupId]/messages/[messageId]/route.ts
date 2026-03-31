export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: { groupId: string; messageId: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    if (!session || !user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { groupId, messageId } = params;
    const userInGroup = user.role === "SUPERADMIN" || user.groupId === groupId;

    if (!userInGroup) {
      return NextResponse.json({ error: "Sem permissão para apagar mensagens neste grupo" }, { status: 403 });
    }

    const message = await prisma.groupMessage.findUnique({
      where: { id: messageId },
      select: { id: true, groupId: true, senderUserId: true },
    });

    if (!message || message.groupId !== groupId) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    }

    const canDelete = user.role === "SUPERADMIN" || message.senderUserId === user.id;

    if (!canDelete) {
      return NextResponse.json({ error: "Você só pode apagar mensagens enviadas por você" }, { status: 403 });
    }

    await prisma.groupMessage.delete({ where: { id: messageId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete group message error:", error);
    return NextResponse.json({ error: "Erro ao apagar mensagem" }, { status: 500 });
  }
}
