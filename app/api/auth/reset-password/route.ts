import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token e nova senha são obrigatórios" }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres" }, { status: 400 });
    }

    const resetToken = await (prisma as any).passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
    }

    if (resetToken.used) {
      return NextResponse.json({ error: "Este link já foi utilizado" }, { status: 400 });
    }

    if (new Date() > new Date(resetToken.expires)) {
      return NextResponse.json({ error: "Link expirado. Solicite um novo" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    await (prisma as any).passwordResetToken.update({
      where: { token },
      data: { used: true },
    });

    return NextResponse.json({ success: true, message: "Senha redefinida com sucesso" });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Erro ao redefinir senha" }, { status: 500 });
  }
}
