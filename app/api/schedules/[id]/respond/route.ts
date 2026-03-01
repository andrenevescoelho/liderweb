export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const userId = user?.id;
    const userRole = user?.role ?? "MEMBER";
    const userPermissions = user?.permissions ?? [];

    if (!hasPermission(userRole, "schedule.presence.confirm.self", userPermissions)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await req.json();
    const { roleId, status } = body ?? {};

    if (!roleId || !status) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    if (status !== "ACCEPTED" && status !== "DECLINED") {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    const role = await prisma.scheduleRole.findFirst({
      where: {
        id: roleId,
        scheduleId: params?.id,
        memberId: userId,
      },
    });

    if (!role) {
      return NextResponse.json(
        { error: "Compromisso não encontrado" },
        { status: 404 }
      );
    }

    const updatedRole = await prisma.scheduleRole.update({
      where: { id: roleId },
      data: { status },
    });

    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error("Respond to schedule error:", error);
    return NextResponse.json(
      { error: "Erro ao responder escala" },
      { status: 500 }
    );
  }
}
