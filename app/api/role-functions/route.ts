export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// GET /api/role-functions
// Retorna as funções que o grupo possui (com pelo menos 1 membro ativo)
// Usada para popular o select de papéis na criação de escalas

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!user?.id || !user?.groupId) {
    return NextResponse.json([], { status: 401 });
  }

  // Busca funções do grupo que têm pelo menos 1 membro ativo com essa função
  const functions = await prisma.roleFunction.findMany({
    where: {
      groupId: user.groupId,
      members: {
        some: {
          member: {
            profile: { active: true },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { members: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(functions.map((f) => ({
    id: f.id,
    name: f.name,
    memberCount: f._count.members,
  })));
}
