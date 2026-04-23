export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { sendSmtpMail } from "@/lib/smtp";
import { isEmailEnabled } from "@/lib/email-config";
import { logUserAction, AUDIT_ACTIONS } from "@/lib/audit-log";
import { AuditEntityType } from "@prisma/client";

// POST /api/signup/attach-group
// Cria um novo grupo e vincula o usuário já autenticado (ex: Google) como ADMIN.
// Diferente de /api/signup/new-group que cria usuário + grupo juntos.

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;

    // Só permitir se o usuário ainda não tem grupo
    if (user.groupId) {
      return NextResponse.json(
        { error: "Você já está vinculado a um ministério" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { groupName, keyword } = body;

    if (!groupName?.trim() || !keyword?.trim()) {
      return NextResponse.json(
        { error: "Nome do ministério e palavra-chave são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar se já existe grupo com este nome
    const existingGroup = await prisma.group.findFirst({
      where: { name: { equals: groupName.trim(), mode: "insensitive" } },
    });

    if (existingGroup) {
      return NextResponse.json(
        { error: "Já existe um ministério com este nome" },
        { status: 400 }
      );
    }

    // Buscar dados atuais do usuário no banco
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, groupId: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (dbUser.groupId) {
      return NextResponse.json(
        { error: "Você já está vinculado a um ministério" },
        { status: 400 }
      );
    }

    // Criar grupo e atualizar usuário em transação
    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: groupName.trim(),
          description: keyword.trim(),
          active: true,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: dbUser.id },
        data: {
          groupId: group.id,
          role: "ADMIN",
        },
      });

      // Criar perfil se não existir
      await tx.memberProfile.upsert({
        where: { userId: dbUser.id },
        create: { userId: dbUser.id, active: true },
        update: {},
      });

      return { group, user: updatedUser };
    });

    // Audit log
    logUserAction({
      userId: result.user.id, groupId: result.group.id,
      action: AUDIT_ACTIONS.ACCOUNT_CREATED,
      entityType: AuditEntityType.USER,
      entityId: result.user.id, entityName: result.user.name,
      description: `Novo ministério criado via Google: ${result.group.name} (admin: ${dbUser.email})`,
      metadata: { groupName: result.group.name, email: dbUser.email, provider: "google" },
    }).catch(() => {});

    // Emails
    try {
      const emailEnabled = await isEmailEnabled("new_account").catch(() => true);
      if (emailEnabled) {
        const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
        const appUrl = process.env.NEXTAUTH_URL ?? "https://liderweb.multitrackgospel.com";

        await sendSmtpMail({
          to: fromEmail,
          subject: `🏛️ Novo ministério cadastrado: ${result.group.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🏛️ Novo Ministério Cadastrado</p>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 16px;color:#1e293b;">Um novo ministério se cadastrou via Google:</p>
                <table cellpadding="0" cellspacing="0">
                  <tr><td style="padding:4px 0;color:#64748b;width:120px;">Ministério</td><td style="padding:4px 0;font-weight:600;color:#1e293b;">${result.group.name}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Admin</td><td style="padding:4px 0;color:#1e293b;">${dbUser.name}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Email</td><td style="padding:4px 0;color:#1e293b;">${dbUser.email}</td></tr>
                  <tr><td style="padding:4px 0;color:#64748b;">Data</td><td style="padding:4px 0;color:#1e293b;">${new Date().toLocaleString("pt-BR")}</td></tr>
                </table>
                <div style="margin-top:20px;text-align:center;">
                  <a href="${appUrl}/admin?tab=groups" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;">Ver no painel</a>
                </div>
              </div>
            </div>`,
          fromEmail,
          fromName: "Líder Web",
        }).catch(err => console.warn("[attach-group] email superadmin falhou:", err));

        await sendSmtpMail({
          to: dbUser.email!,
          subject: `🎉 Bem-vindo ao Líder Web, ${dbUser.name}!`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
                <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Bem-vindo ao Líder Web! 🎉</p>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
                <p style="margin:0 0 12px;color:#1e293b;">Olá, <strong>${dbUser.name}</strong>!</p>
                <p style="margin:0 0 16px;color:#64748b;">Seu ministério <strong>${result.group.name}</strong> foi criado com sucesso. Agora escolha um plano para começar a usar a plataforma.</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${appUrl}/planos" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">Escolher plano</a>
                </div>
              </div>
            </div>`,
          fromEmail,
          fromName: "Líder Web",
        }).catch(err => console.warn("[attach-group] email boas-vindas falhou:", err));
      }
    } catch (emailErr) {
      console.warn("[attach-group] erro ao enviar emails:", emailErr);
    }

    return NextResponse.json({
      success: true,
      groupId: result.group.id,
      message: "Ministério criado com sucesso!",
    });
  } catch (error: any) {
    console.error("[attach-group] erro:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao criar ministério" },
      { status: 500 }
    );
  }
}
