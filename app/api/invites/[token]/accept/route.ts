import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { emailsMatch } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || !(session.user as any).id) {
      return NextResponse.json({ error: "Faça login para aceitar o convite" }, { status: 401 });
    }

    const { token } = await params;

    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: { group: { select: { id: true, name: true } } },
    });

    if (!invite) {
      return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
    }

    if (invite.used) {
      return NextResponse.json({ error: "Este convite já foi utilizado" }, { status: 400 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Este convite expirou" }, { status: 400 });
    }

    if (!emailsMatch(invite.email, session.user.email)) {
      return NextResponse.json(
        { error: `Este convite foi enviado para ${invite.email}. Entre com essa conta para continuar.` },
        { status: 409 }
      );
    }

    const userId = (session.user as any).id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, groupId: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário autenticado não encontrado" }, { status: 404 });
    }

    if (user.groupId && user.groupId !== invite.groupId) {
      return NextResponse.json(
        { error: "Sua conta já está vinculada a outro ministério. Contate o suporte para migração." },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          groupId: invite.groupId,
          ...(user.role === "MEMBER" ? { role: "MEMBER" } : {}),
        },
      });

      const existingProfile = await tx.memberProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });

      if (!existingProfile) {
        await tx.memberProfile.create({
          data: {
            userId: user.id,
            active: true,
          },
        });
      }

      await tx.inviteToken.update({
        where: { id: invite.id },
        data: { used: true },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Conta vinculada com sucesso ao ministério",
      groupName: invite.group.name,
      groupId: invite.group.id,
    });
  } catch (error) {
    console.error("Error accepting invite:", error);
    return NextResponse.json({ error: "Erro ao aceitar convite" }, { status: 500 });
  }
}
