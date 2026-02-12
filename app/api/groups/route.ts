import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

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

  return NextResponse.json(group, { status: 201 });
}
