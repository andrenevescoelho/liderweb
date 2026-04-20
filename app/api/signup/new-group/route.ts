export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendSmtpMail } from "@/lib/smtp";
import { isEmailEnabled } from "@/lib/email-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { groupName, keyword, userName, userEmail, userPassword, planId } = body;

    // Validar campos obrigatórios
    if (!groupName || !keyword || !userName || !userEmail || !userPassword) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar se já existe usuário com este email
    const normalizedEmail = userEmail.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 400 }
      );
    }

    // Verificar se já existe grupo com esta palavra-chave
    const existingGroup = await prisma.group.findFirst({
      where: { 
        OR: [
          { name: { equals: groupName, mode: 'insensitive' } },
          // A keyword pode ser parte de alguma lógica futura
        ]
      },
    });

    if (existingGroup) {
      return NextResponse.json(
        { error: "Já existe um grupo com este nome" },
        { status: 400 }
      );
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(userPassword, 10);

    // Criar grupo e usuário em uma transação
    const result = await prisma.$transaction(async (tx) => {
      // Criar o grupo
      const group = await tx.group.create({
        data: {
          name: groupName,
          description: keyword, // Usar keyword como descrição
          active: true,
        },
      });

      // Criar o usuário como ADMIN do grupo
      const user = await tx.user.create({
        data: {
          name: userName,
          email: normalizedEmail,
          password: hashedPassword,
          role: "ADMIN",
          groupId: group.id,
        },
      });

      // Criar perfil do membro
      await tx.memberProfile.create({
        data: {
          userId: user.id,
          active: true,
        },
      });

      return { group, user };
    });

    // ── Email de novo grupo criado ──────────────────────────────────────
    try {
      const emailEnabled = await isEmailEnabled("new_account").catch(() => true);
      if (emailEnabled) {
        const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
        const appUrl = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";

        // Email para o SUPERADMIN
        await sendSmtpMail({
          to: fromEmail,
          subject: `🏛️ Novo ministério cadastrado: ${result.group.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🏛️ Novo Ministério Cadastrado</p>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 16px;color:#1e293b;">Um novo ministério se cadastrou na plataforma:</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:4px 0;color:#64748b;width:120px;">Ministério</td><td style="padding:4px 0;font-weight:600;color:#1e293b;">${result.group.name}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Admin</td><td style="padding:4px 0;color:#1e293b;">${result.user.name}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Email</td><td style="padding:4px 0;color:#1e293b;">${result.user.email}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Data</td><td style="padding:4px 0;color:#1e293b;">${new Date().toLocaleString("pt-BR")}</td></tr>
                </table>
                <div style="margin-top:20px;text-align:center;">
                  <a href="${appUrl}/admin?tab=groups" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;">Ver no painel</a>
                </div>
              </div>
            </div>`,
          fromEmail,
          fromName: "Líder Web",
        }).catch(err => console.warn("[signup] email superadmin falhou:", err));

        // Email de boas-vindas para o admin do novo grupo
        await sendSmtpMail({
          to: result.user.email,
          subject: `🎉 Bem-vindo ao Líder Web, ${result.user.name}!`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Bem-vindo ao Líder Web! 🎉</p>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 12px;color:#1e293b;">Olá, <strong>${result.user.name}</strong>!</p>
                <p style="margin:0 0 16px;color:#64748b;">Seu ministério <strong>${result.group.name}</strong> foi criado com sucesso. Agora escolha um plano para começar a usar a plataforma.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${appUrl}/planos" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Escolher plano</a>
                </div>
                <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Líder Web · by multitrackgospel.com</p>
              </div>
            </div>`,
          fromEmail,
          fromName: "Líder Web",
        }).catch(err => console.warn("[signup] email boas-vindas falhou:", err));
      }
    } catch (emailErr) {
      console.warn("[signup] erro ao enviar emails:", emailErr);
    }

    return NextResponse.json({
      success: true,
      groupId: result.group.id,
      userId: result.user.id,
      email: result.user.email,
      message: "Grupo criado com sucesso! Faça login para continuar.",
    });
  } catch (error: any) {
    console.error("Erro ao criar grupo:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao criar grupo" },
      { status: 500 }
    );
  }
}
