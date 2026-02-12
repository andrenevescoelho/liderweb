import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;
  const { id } = params;

  // Verificar permissão
  if (user.role !== "SUPERADMIN" && user.groupId !== id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      users: {
        include: { profile: true },
      },
      _count: {
        select: { songs: true, setlists: true, schedules: true },
      },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  }

  return NextResponse.json(group);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;
  const { id } = params;

  // Apenas SuperAdmin ou Admin do grupo pode editar
  if (user.role !== "SUPERADMIN" && (user.role !== "ADMIN" || user.groupId !== id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, active } = body;

  const group = await prisma.group.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(active !== undefined && { active }),
    },
  });

  return NextResponse.json(group);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const user = session.user as any;

  // Apenas SuperAdmin pode deletar grupos
  if (user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = params;

  await prisma.group.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
