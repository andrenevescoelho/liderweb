export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const setlist = await prisma.setlist.findUnique({
      where: { id: params?.id },
      include: {
        items: {
          include: { song: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!setlist) {
      return NextResponse.json({ error: "Repertório não encontrado" }, { status: 404 });
    }

    return NextResponse.json(setlist);
  } catch (error) {
    console.error("Get setlist error:", error);
    return NextResponse.json({ error: "Erro ao buscar repertório" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { name, date, items } = body ?? {};

    await prisma.setlistItem.deleteMany({
      where: { setlistId: params?.id },
    });

    const setlist = await prisma.setlist.update({
      where: { id: params?.id },
      data: {
        name,
        date: new Date(date),
        items: {
          create: (items ?? [])?.map?.((item: any, index: number) => ({
            songId: item?.songId,
            selectedKey: item?.selectedKey ?? "C",
            order: index,
          })),
        },
      },
      include: {
        items: {
          include: { song: true },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(setlist);
  } catch (error) {
    console.error("Update setlist error:", error);
    return NextResponse.json({ error: "Erro ao atualizar repertório" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as any)?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await prisma.setlist.delete({
      where: { id: params?.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete setlist error:", error);
    return NextResponse.json({ error: "Erro ao excluir repertório" }, { status: 500 });
  }
}
