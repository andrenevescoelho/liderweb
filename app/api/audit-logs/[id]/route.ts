import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

function canAccessAuditLogs(role?: string) {
  return role === "SUPERADMIN" || role === "ADMIN";
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (!canAccessAuditLogs(user.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (!log) return NextResponse.json({ error: "Log não encontrado" }, { status: 404 });

    if (user.role === "ADMIN" && log.groupId !== user.groupId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    return NextResponse.json(log);
  } catch (error) {
    console.error("Get audit log details error:", error);
    return NextResponse.json({ error: "Erro ao buscar detalhes do log" }, { status: 500 });
  }
}
