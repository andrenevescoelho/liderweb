import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET - Listar convites pendentes do grupo
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

    // SUPERADMIN pode ver todos, demais apenas do próprio grupo
    const where = user.role === "SUPERADMIN" ? {} : { groupId: user.groupId ?? undefined };

    const invites = await prisma.inviteToken.findMany({
      where: {
        ...where,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        group: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invites);
  } catch (error) {
    console.error("Error fetching pending invites:", error);
    return NextResponse.json({ error: "Erro ao buscar convites" }, { status: 500 });
  }
}
