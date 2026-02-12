import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST - Criar convite e enviar por email
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
    
    const body = await req.json();
    const { email, groupId, memberName } = body;
    
    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }
    
    // Determinar groupId
    const targetGroupId = user.role === "SUPERADMIN" ? groupId : user.groupId;
    
    if (!targetGroupId) {
      return NextResponse.json({ error: "Grupo não especificado" }, { status: 400 });
    }
    
    // Buscar informações do grupo
    const group = await prisma.group.findUnique({
      where: { id: targetGroupId },
    });
    
    if (!group) {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
    }
    
    // Verificar se já existe usuário com esse email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    
    if (existingUser) {
      return NextResponse.json({ error: "Este email já está cadastrado no sistema" }, { status: 400 });
    }
    
    // Verificar se já existe convite pendente para esse email nesse grupo
    const existingInvite = await prisma.inviteToken.findFirst({
      where: {
        email,
        groupId: targetGroupId,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
    
    if (existingInvite) {
      return NextResponse.json({ error: "Já existe um convite pendente para este email" }, { status: 400 });
    }
    
    // Gerar token único
    const token = randomBytes(32).toString("hex");
    
    // Criar convite (expira em 7 dias)
    const invite = await prisma.inviteToken.create({
      data: {
        token,
        email,
        groupId: targetGroupId,
        invitedBy: user.id ?? '',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    
    // Enviar email
    const appUrl = process.env.NEXTAUTH_URL || '';
    const appName = appUrl ? new URL(appUrl).hostname.split('.')[0] : 'LiderWeb';
    const inviteLink = `${appUrl}/signup?token=${token}`;
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px; text-align: center;">
            🎵 Convite para ${group.name}
          </h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
            Olá${memberName ? ` ${memberName}` : ''}!
          </p>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
            Você foi convidado(a) por <strong>${session.user.name}</strong> para fazer parte do ministério 
            <strong>${group.name}</strong> no LiderWeb.
          </p>
          
          <p style="font-size: 16px; color: #374151; margin-bottom: 30px;">
            O LiderWeb é uma plataforma de gestão de ministério de louvor que facilita a organização 
            de escalas, repertórios e muito mais.
          </p>
          
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${inviteLink}" 
               style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); 
                      color: white; 
                      padding: 14px 32px; 
                      border-radius: 8px; 
                      text-decoration: none; 
                      font-weight: bold;
                      font-size: 16px;
                      display: inline-block;">
              Aceitar Convite
            </a>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
            Ou copie e cole este link no seu navegador:
          </p>
          <p style="font-size: 12px; color: #9ca3af; word-break: break-all; background: #f3f4f6; padding: 10px; border-radius: 4px;">
            ${inviteLink}
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">
            Este convite expira em 7 dias.
          </p>
        </div>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
            © ${new Date().getFullYear()} LiderWeb - Gestão de Ministério de Louvor
          </p>
        </div>
      </div>
    `;
    
    try {
      const emailResponse = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_CONVITE_PARA_GRUPO,
          subject: `🎵 Convite para o ministério ${group.name}`,
          body: htmlBody,
          is_html: true,
          recipient_email: email,
          sender_email: `noreply@${appUrl ? new URL(appUrl).hostname : 'liderweb.app'}`,
          sender_alias: 'LiderWeb',
        }),
      });
      
      const emailResult = await emailResponse.json();
      
      if (!emailResult.success && !emailResult.notification_disabled) {
        console.error('Failed to send invite email:', emailResult);
      }
    } catch (emailError) {
      console.error('Error sending invite email:', emailError);
      // Continue mesmo se o email falhar
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Convite enviado por email!",
      invite: {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
      },
      inviteLink,
    });
  } catch (error) {
    console.error("Error creating and sending invite:", error);
    return NextResponse.json({ error: "Erro ao enviar convite" }, { status: 500 });
  }
}
