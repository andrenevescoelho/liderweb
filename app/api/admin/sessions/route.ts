export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { invalidateSessionTimeoutCache } from "@/lib/session-guard";

function isSuperAdmin(user: any) {
  return user?.role === "SUPERADMIN";
}

// GET /api/admin/sessions?userId=xxx | ?config=global
// Lista sessões ativas ou busca configuração global
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Configuração global de timeout
  if (req.nextUrl.searchParams.get("config") === "global") {
    const config = await (prisma as any).systemConfig.findUnique({
      where: { key: "session_timeout_hours" },
      select: { value: true },
    }).catch(() => null);
    return NextResponse.json({ globalTimeoutHours: config ? parseInt(config.value) : null });
  }
  const userId = req.nextUrl.searchParams.get("userId");

  if (userId) {
    // Sessões de um usuário específico
    const [user, sessions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, maxSessions: true, sessionTimeoutHours: true, role: true },
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
      sessionTimeoutHours: true,
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
// Atualizar maxSessions, sessionTimeoutHours de um usuário ou config global
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperAdmin(session?.user)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, maxSessions, sessionTimeoutHours, globalTimeoutHours } = body;

  // Configuração global de timeout
  if (typeof globalTimeoutHours !== "undefined") {
    if (globalTimeoutHours === null || globalTimeoutHours === 0) {
      await (prisma as any).systemConfig.deleteMany({ where: { key: "session_timeout_hours" } });
    } else {
      await (prisma as any).systemConfig.upsert({
        where: { key: "session_timeout_hours" },
        create: { key: "session_timeout_hours", value: String(globalTimeoutHours), updatedBy: (session!.user as any).id },
        update: { value: String(globalTimeoutHours), updatedBy: (session!.user as any).id },
      });
    }
    invalidateSessionTimeoutCache();
    return NextResponse.json({ globalTimeoutHours: globalTimeoutHours ?? null });
  }

  // Configuração por usuário
  if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });

  const updateData: any = {};

  if (typeof maxSessions === "number") {
    if (maxSessions < 1 || maxSessions > 10) {
      return NextResponse.json({ error: "maxSessions deve ser entre 1 e 10" }, { status: 400 });
    }
    updateData.maxSessions = maxSessions;
  }

  if (typeof sessionTimeoutHours !== "undefined") {
    updateData.sessionTimeoutHours = sessionTimeoutHours === null || sessionTimeoutHours === 0
      ? null
      : Number(sessionTimeoutHours);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true, maxSessions: true, sessionTimeoutHours: true },
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
