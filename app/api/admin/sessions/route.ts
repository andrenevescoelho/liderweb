export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

function isSuperAdmin(user: any) {
  return user?.role === "SUPERADMIN";
}

// GET /api/admin/sessions?userId=xxx
// Lista sessões ativas de um usuário específico ou de todos
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");

  if (userId) {
    // Sessões de um usuário específico
    const [user, sessions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, maxSessions: true, role: true },
      }),
      (prisma as any).userActiveSession.findMany({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
      }),
    ]);

    if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    return NextResponse.json({ user, sessions });
  }

  // Todos os usuários com contagem de sessões ativas
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      maxSessions: true,
      activeSessions: {
        select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, sessionId: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

// PATCH /api/admin/sessions
// Atualizar maxSessions de um usuário
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { userId, maxSessions } = await req.json();

  if (!userId || typeof maxSessions !== "number" || maxSessions < 1 || maxSessions > 10) {
    return NextResponse.json({ error: "Parâmetros inválidos (maxSessions: 1-10)" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { maxSessions },
    select: { id: true, name: true, email: true, maxSessions: true },
  });

  return NextResponse.json(user);
}

// DELETE /api/admin/sessions
// Revogar uma sessão específica ou todas de um usuário
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { sessionId, userId, revokeAll } = await req.json();

  if (revokeAll && userId) {
    // Revogar todas as sessões do usuário
    const { count } = await (prisma as any).userActiveSession.deleteMany({
      where: { userId },
    });
    return NextResponse.json({ deleted: count, message: `${count} sessão(ões) revogada(s)` });
  }

  if (sessionId) {
    // Revogar sessão específica
    await (prisma as any).userActiveSession.delete({
      where: { sessionId },
    }).catch(() => null);
    return NextResponse.json({ deleted: 1, message: "Sessão revogada" });
  }

  return NextResponse.json({ error: "sessionId ou userId+revokeAll são obrigatórios" }, { status: 400 });
}
