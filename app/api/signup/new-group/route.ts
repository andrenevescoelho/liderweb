export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

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
    const existingUser = await prisma.user.findUnique({
      where: { email: userEmail.toLowerCase() },
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
          email: userEmail.toLowerCase(),
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
