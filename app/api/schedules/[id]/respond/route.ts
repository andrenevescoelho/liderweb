export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = (session?.user as any)?.id;
    const body = await req.json();
    const { roleId, status } = body ?? {};

    if (!roleId || !status) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
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
        { error: "Você não está escalado para esta função" },
        { status: 403 }
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
