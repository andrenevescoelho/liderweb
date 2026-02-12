import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET - Listar convites do grupo
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    
    const user = session.user as SessionUser;
    
    if (user.role !== "SUPERADMIN" && user.role !== "ADMIN" && user.role !== "LEADER") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    
    const where = user.role === "SUPERADMIN" ? {} : { groupId: user.groupId ?? undefined };
    
    const invites = await prisma.inviteToken.findMany({
      where,
      include: {
        group: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json(invites);
  } catch (error) {
    console.error("Error fetching invites:", error);
    return NextResponse.json({ error: "Erro ao buscar convites" }, { status: 500 });
  }
}

// POST - Criar novo convite
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
    const { email, groupId } = body;
    
    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }
    
    // Determinar groupId
    const targetGroupId = user.role === "SUPERADMIN" ? groupId : user.groupId;
    
    if (!targetGroupId) {
      return NextResponse.json({ error: "Grupo não especificado" }, { status: 400 });
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
      include: {
        group: { select: { name: true } },
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      invite,
      inviteLink: `/signup?token=${token}`,
    });
  } catch (error) {
    console.error("Error creating invite:", error);
    return NextResponse.json({ error: "Erro ao criar convite" }, { status: 500 });
  }
}
