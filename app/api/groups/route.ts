import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { AUDIT_ACTIONS, extractRequestContext, logUserAction } from "@/lib/audit-log";
import { sendSmtpMail } from "@/lib/smtp";
import { isEmailEnabled } from "@/lib/email-config";
import { AuditEntityType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;

  // SuperAdmin pode ver todos os grupos
  if (user.role === "SUPERADMIN") {
    const groups = await prisma.group.findMany({
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true },
        },
        _count: {
          select: { users: true, songs: true, setlists: true, schedules: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(groups);
  }

  // Outros usuários vêem apenas seu grupo
  if (!user.groupId) {
    return NextResponse.json([]);
  }

  const group = await prisma.group.findUnique({
    where: { id: user.groupId },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  return NextResponse.json(group ? [group] : []);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;

  // Apenas SuperAdmin pode criar grupos
  if (user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const context = extractRequestContext(req);
  const { name, description, adminName, adminEmail, adminPassword } = body;

  if (!name) {
    return NextResponse.json({ error: "Nome do grupo é obrigatório" }, { status: 400 });
  }

  // Criar grupo
  const group = await prisma.group.create({
    data: {
      name,
      description,
    },
  });

  // Se dados do admin foram fornecidos, criar o usuário admin do grupo
  if (adminEmail && adminPassword && adminName) {
    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Já existe um usuário com este e-mail" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
        groupId: group.id,
        profile: {
          create: {
            active: true,
          },
        },
      },
    });
  }

  await logUserAction({
    userId: user.id,
    groupId: group.id,
    action: AUDIT_ACTIONS.GROUP_CREATED,
    entityType: AuditEntityType.GROUP,
    entityId: group.id,
    entityName: group.name,
    description: `Usuário ${user.name} criou o grupo ${group.name}`,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    newValues: { name: group.name, description: group.description, active: group.active },
  });

  // ── Email de novo grupo criado ──────────────────────────────────────
  try {
    const emailEnabled = await isEmailEnabled("new_account").catch(() => true);
    if (emailEnabled) {
      const fromEmail = process.env.SMTP_USER ?? "liderweb@multitrackgospel.com";
      const adminInfo = body.adminEmail ? `\n\nAdmin: ${body.adminName} (${body.adminEmail})` : "";
      await sendSmtpMail({
        to: fromEmail, // envia para o próprio SMTP (superadmin)
        subject: `🏛️ Novo ministério cadastrado: ${group.name}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;">🏛️ Novo Ministério</p>
            </div>
            <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 16px;color:#1e293b;">Um novo ministério foi cadastrado na plataforma:</p>
              <table cellpadding="0" cellspacing="0">
                <tr><td style="padding:4px 0;color:#64748b;width:100px;">Nome</td><td style="padding:4px 0;font-weight:600;color:#1e293b;">${group.name}</td></tr>
                ${body.description ? `<tr><td style="padding:4px 0;color:#64748b;">Descrição</td><td style="padding:4px 0;color:#1e293b;">${body.description}</td></tr>` : ""}
                ${body.adminName ? `<tr><td style="padding:4px 0;color:#64748b;">Admin</td><td style="padding:4px 0;color:#1e293b;">${body.adminName}</td></tr>` : ""}
                ${body.adminEmail ? `<tr><td style="padding:4px 0;color:#64748b;">Email</td><td style="padding:4px 0;color:#1e293b;">${body.adminEmail}</td></tr>` : ""}
                <tr><td style="padding:4px 0;color:#64748b;">Data</td><td style="padding:4px 0;color:#1e293b;">${new Date().toLocaleString("pt-BR")}</td></tr>
              </table>
            </div>
          </div>`,
        fromEmail,
        fromName: "Líder Web",
      }).catch(err => console.warn("[groups] email falhou:", err));
    }
  } catch (emailErr) {
    console.warn("[groups] erro ao enviar email:", emailErr);
  }

  return NextResponse.json(group, { status: 201 });
}
