import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST - Cancelar convite
// body: { inviteId: string }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as SessionUser;
    if (user.role !== "SUPERADMIN" && user.role !== "ADMIN" && user.role !== "LEADER") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const inviteId = body?.inviteId as string | undefined;

    if (!inviteId) {
      return NextResponse.json({ error: "inviteId é obrigatório" }, { status: 400 });
    }

    const invite = await prisma.inviteToken.findUnique({
      where: { id: inviteId },
      select: { id: true, groupId: true, used: true, expiresAt: true },
    });

    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
    }

    // Se não for SUPERADMIN, só pode cancelar convites do próprio grupo
    if (user.role !== "SUPERADMIN" && invite.groupId !== user.groupId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    if (invite.used) {
      return NextResponse.json({ error: "Convite já foi utilizado" }, { status: 400 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Convite já expirou" }, { status: 400 });
    }

    // Cancelamento simples: marca como usado e expira imediatamente
    await prisma.inviteToken.update({
      where: { id: inviteId },
      data: { used: true, expiresAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error canceling invite:", error);
    return NextResponse.json({ error: "Erro ao cancelar convite" }, { status: 500 });
  }
}
