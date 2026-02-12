export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const user = session.user as any;
    const where: any = {};

    // SuperAdmin vê todos, outros veem apenas do seu grupo
    if (user.role !== "SUPERADMIN") {
      if (!user.groupId) {
        return NextResponse.json([]);
      }
      where.groupId = user.groupId;
    }

    const setlists = await prisma.setlist.findMany({
      where,
      include: {
        items: {
          include: { song: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(setlists ?? []);
  } catch (error) {
    console.error("Get setlists error:", error);
    return NextResponse.json({ error: "Erro ao buscar repertórios" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    const userRole = user?.role;

    if (!session || (userRole !== "SUPERADMIN" && userRole !== "ADMIN" && userRole !== "LEADER")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (userRole !== "SUPERADMIN" && !user.groupId) {
      return NextResponse.json({ error: "Usuário não pertence a nenhum grupo" }, { status: 400 });
    }

    const body = await req.json();
    const { name, date, items } = body ?? {};

    if (!name || !date) {
      return NextResponse.json(
        { error: "Nome e data são obrigatórios" },
        { status: 400 }
      );
    }

    const setlist = await prisma.setlist.create({
      data: {
        name,
        date: new Date(date),
        groupId: user.groupId ?? null,
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
    console.error("Create setlist error:", error);
    return NextResponse.json({ error: "Erro ao criar repertório" }, { status: 500 });
  }
}
