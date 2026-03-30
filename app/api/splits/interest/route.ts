import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    const { email, name } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    // Verificar se já registrou interesse
    const existing = await (prisma as any).splitInterest.findFirst({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json({ success: true, alreadyRegistered: true });
    }

    await (prisma as any).splitInterest.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name || user?.name || null,
        groupId: user?.groupId || null,
        userId: user?.id || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Split interest error:", error);
    return NextResponse.json({ error: "Erro ao registrar interesse" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;

    if (!session || user?.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const interests = await (prisma as any).splitInterest.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ interests, total: interests.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
