import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { accounts: { select: { provider: true } } },
    });

    // Sempre retornar sucesso para não revelar se o email existe
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Usuários Google não têm senha local
    const isGoogleUser = user.accounts.some(a => a.provider === "google");
    if (isGoogleUser) {
      return NextResponse.json({ success: true });
    }

    // Invalidar tokens anteriores
    await (prisma as any).passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Criar novo token — expira em 1 hora
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await (prisma as any).passwordResetToken.create({
      data: { userId: user.id, token, expires },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;

    await sendSmtpMail({
      to: user.email,
      subject: "Redefinição de senha — LiderWeb",
      fromEmail: process.env.SMTP_USER ?? "liderweb@multitrackgospel.com",
      fromName: "LiderWeb",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0b0d12; color: #e2e8f0; border-radius: 12px;">
          <h2 style="color: #14b8a6; margin-bottom: 8px;">Redefinição de senha</h2>
          <p style="color: #94a3b8;">Olá, <strong style="color: #e2e8f0;">${user.name}</strong>!</p>
          <p style="color: #94a3b8;">Recebemos uma solicitação para redefinir a senha da sua conta LiderWeb.</p>
          <p style="color: #94a3b8;">Clique no botão abaixo para criar uma nova senha. O link é válido por <strong style="color: #e2e8f0;">1 hora</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background: #14b8a6; color: #0b0d12; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Redefinir senha
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanece a mesma.</p>
          <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
          <p style="color: #475569; font-size: 12px;">LiderWeb · by multitrackgospel.com</p>
        </div>
      `,
    });

    logUserAction({
      userId: user.id, groupId: null,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      entityType: AuditEntityType.AUTH,
      entityId: user.id, entityName: user.email,
      description: `Solicitação de redefinição de senha para ${user.email}`,
      metadata: { email: user.email },
    }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 });
  }
}
