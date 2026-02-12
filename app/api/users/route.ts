import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET all users (SUPERADMIN only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const groupId = searchParams.get("groupId");
    const noGroup = searchParams.get("noGroup") === "true";

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (groupId) {
      where.groupId = groupId;
    } else if (noGroup) {
      where.groupId = null;
      where.role = { not: "SUPERADMIN" };
    }

    const users = await prisma.user.findMany({
      where,
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
        profile: {
          select: {
            phone: true,
            instruments: true,
            active: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json(
      { error: "Erro ao buscar usuários" },
      { status: 500 }
    );
  }
}

// POST create new user (SUPERADMIN only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, groupId } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "Email já está em uso" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // SUPERADMIN não pertence a nenhum grupo
    const finalGroupId = role === "SUPERADMIN" ? null : (groupId || null);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "MEMBER",
        groupId: finalGroupId,
        profile: finalGroupId ? {
          create: {
            active: true,
          },
        } : undefined,
      },
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

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    return NextResponse.json(
      { error: "Erro ao criar usuário" },
      { status: 500 }
    );
  }
}
