import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!session || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verificar se o usuário tem conta Google (SSO) — se tiver, não pode trocar senha aqui
    const googleAccount = await prisma.account.findFirst({
      where: { userId: user.id, provider: "google" },
    });

    if (googleAccount) {
      return NextResponse.json(
        { error: "Sua senha é gerenciada pelo Google. Acesse as configurações da sua conta Google para alterá-la." },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Senha atual e nova senha são obrigatórias" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 8 caracteres" }, { status: 400 });
    }

    // Buscar usuário com senha atual
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, password: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (!dbUser.password) {
      return NextResponse.json(
        { error: "Sua conta não possui senha local configurada." },
        { status: 400 }
      );
    }

    // Verificar senha atual
    const isValid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isValid) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 });
    }

    // Hash da nova senha e salvar
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true, message: "Senha alterada com sucesso" });
  } catch (error: any) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
