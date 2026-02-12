export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, token, groupId } = body ?? {};

    if (!password || !name) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 }
      );
    }

    // Se tem token de convite, validar e usar dados do convite
    if (token) {
      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: { group: true },
      });
      
      if (!invite) {
        return NextResponse.json(
          { error: "Convite não encontrado" },
          { status: 400 }
        );
      }
      
      if (invite.used) {
        return NextResponse.json(
          { error: "Este convite já foi utilizado" },
          { status: 400 }
        );
      }
      
      if (invite.expiresAt < new Date()) {
        return NextResponse.json(
          { error: "Este convite expirou" },
          { status: 400 }
        );
      }
      
      // Verificar se já existe usuário com esse email
      const existingUser = await prisma.user.findUnique({
        where: { email: invite.email },
      });
      
      if (existingUser) {
        return NextResponse.json(
          { error: "Email já cadastrado" },
          { status: 400 }
        );
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Criar usuário como MEMBER do grupo
      const user = await prisma.user.create({
        data: {
          email: invite.email,
          password: hashedPassword,
          name,
          role: "MEMBER",
          groupId: invite.groupId,
          profile: {
            create: {
              active: true,
            },
          },
        },
      });
      
      // Marcar convite como usado
      await prisma.inviteToken.update({
        where: { id: invite.id },
        data: { used: true },
      });
      
      return NextResponse.json({
        id: user?.id,
        email: user?.email,
        name: user?.name,
        groupId: user?.groupId,
      });
    }
    
    // Cadastro normal (sem convite) - não permitido mais
    // Usuários devem criar grupo ou receber convite
    if (!email) {
      return NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      );
    }
    
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email já cadastrado" },
        { status: 400 }
      );
    }

    // Se groupId foi fornecido (para convites sem token)
    if (groupId) {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: "MEMBER",
          groupId,
          profile: {
            create: {
              active: true,
            },
          },
        },
      });

      return NextResponse.json({
        id: user?.id,
        email: user?.email,
        name: user?.name,
        groupId: user?.groupId,
      });
    }

    // Cadastro sem grupo não é mais permitido
    return NextResponse.json(
      { error: "Para se cadastrar, você precisa criar um grupo ou receber um convite." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Erro ao criar conta" },
      { status: 500 }
    );
  }
}
