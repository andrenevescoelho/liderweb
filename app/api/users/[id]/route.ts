import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET single user
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const currentUser = session?.user as SessionUser | undefined;
    
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (currentUser.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        groupId: true,
        group: {
          select: {
            id: true,
            name: true,
          },
        },
        profile: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return NextResponse.json(
      { error: "Erro ao buscar usuário" },
      { status: 500 }
    );
  }
}

// PUT update user (SUPERADMIN only)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const currentUser = session?.user as SessionUser | undefined;
    
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (currentUser.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, groupId } = body;

    const existingUser = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Check if email is being changed and if it's already in use
    if (email && email !== existingUser.email) {
      const emailInUse = await prisma.user.findUnique({ where: { email } });
      if (emailInUse) {
        return NextResponse.json(
          { error: "Email já está em uso" },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    if (role) updateData.role = role;
    
    // SUPERADMIN não pertence a nenhum grupo
    if (role === "SUPERADMIN") {
      updateData.groupId = null;
    } else if (groupId !== undefined) {
      updateData.groupId = groupId || null;
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        groupId: true,
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar usuário" },
      { status: 500 }
    );
  }
}

// DELETE user (SUPERADMIN only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const currentUser = session?.user as SessionUser | undefined;
    
    if (!currentUser) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (currentUser.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Prevent deleting self
    if (params.id === currentUser.id) {
      return NextResponse.json(
        { error: "Você não pode excluir sua própria conta" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Delete profile first if exists
    await prisma.memberProfile.deleteMany({
      where: { userId: params.id },
    });

    await prisma.user.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return NextResponse.json(
      { error: "Erro ao excluir usuário" },
      { status: 500 }
    );
  }
}
