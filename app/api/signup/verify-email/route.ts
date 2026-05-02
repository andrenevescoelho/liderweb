export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";

const FROM_EMAIL = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
const TOKEN_EXPIRY_MINUTES = 10;

function generateToken(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/signup/verify-email
// Body: { action: "send", email: string }
//    ou { action: "verify", email: string, token: string }

export async function POST(req: NextRequest) {
  try {
    const { action, email, token } = await req.json();

    if (!email || !action) {
      return NextResponse.json({ error: "email e action são obrigatórios" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Enviar token ───────────────────────────────────────────────────────────
    if (action === "send") {
      // Verificar se email já está cadastrado
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "Este e-mail já está cadastrado. Faça login ou use outro e-mail." },
          { status: 400 }
        );
      }

      // Remover tokens anteriores para este email
      await (prisma as any).emailVerificationToken.deleteMany({
        where: { email: normalizedEmail },
      });

      // Criar novo token
      const newToken = generateToken();
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

      await (prisma as any).emailVerificationToken.create({
        data: {
          email: normalizedEmail,
          token: newToken,
          expiresAt,
        },
      });

      // Enviar e-mail
      await sendSmtpMail({
        to: normalizedEmail,
        subject: "Seu código de verificação — Líder Web",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Líder Web</p>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Confirmação de cadastro</p>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;">
              <p style="margin:0 0 8px;color:#1e293b;font-size:16px;">Seu código de verificação é:</p>
              <div style="background:#f8fafc;border:2px solid #7c3aed;border-radius:12px;padding:20px;margin:16px 0;display:inline-block;">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#7c3aed;">${newToken}</span>
              </div>
              <p style="margin:0;color:#64748b;font-size:14px;">Este código expira em <strong>${TOKEN_EXPIRY_MINUTES} minutos</strong>.</p>
              <p style="margin:8px 0 0;color:#64748b;font-size:13px;">Se você não solicitou este código, ignore este e-mail.</p>
            </div>
          </div>`,
        fromEmail: FROM_EMAIL,
        fromName: "Líder Web",
      });

      return NextResponse.json({ sent: true, message: `Código enviado para ${normalizedEmail}` });
    }

    // ── Verificar token ────────────────────────────────────────────────────────
    if (action === "verify") {
      if (!token) {
        return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });
      }

      const record = await (prisma as any).emailVerificationToken.findFirst({
        where: {
          email: normalizedEmail,
          token: token.trim(),
          verified: false,
        },
      });

      if (!record) {
        return NextResponse.json({ error: "Código inválido. Verifique e tente novamente." }, { status: 400 });
      }

      if (new Date(record.expiresAt) < new Date()) {
        await (prisma as any).emailVerificationToken.delete({ where: { id: record.id } });
        return NextResponse.json({ error: "Código expirado. Solicite um novo código." }, { status: 400 });
      }

      // Marcar como verificado
      await (prisma as any).emailVerificationToken.update({
        where: { id: record.id },
        data: { verified: true },
      });

      return NextResponse.json({ verified: true, message: "E-mail verificado com sucesso!" });
    }

    return NextResponse.json({ error: "action inválida" }, { status: 400 });

  } catch (error: any) {
    console.error("[verify-email] erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
