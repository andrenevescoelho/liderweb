export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";

async function hasPremiumSupport(groupId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { groupId },
    include: { plan: true, billingPlan: true },
  });
  if (!sub || !["ACTIVE", "TRIALING"].includes(sub.status)) return false;

  // Verificar pelo BillingPlan
  if ((sub as any).billingPlan) {
    const slug = ((sub as any).billingPlan.slug ?? "").toLowerCase();
    return slug.includes("avancado") || slug.includes("igreja") || slug.includes("enterprise");
  }

  // Fallback pelo nome do plano legado
  const name = (sub.plan?.name ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return name.includes("avancado") || name.includes("igreja") || name.includes("enterprise");
}

// GET — listar tickets do grupo
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const tickets = await (prisma as any).supportTicket.findMany({
      where: { groupId: user.groupId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });

    const isPremium = await hasPremiumSupport(user.groupId);
    return NextResponse.json({ tickets, isPremium });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — criar ticket
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user?.groupId) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const isPremium = await hasPremiumSupport(user.groupId);
    if (!isPremium) {
      return NextResponse.json({
        error: "UPGRADE_REQUIRED",
        message: "Suporte premium está disponível nos planos Avançado e Igreja.",
      }, { status: 402 });
    }

    const { subject, message, priority } = await req.json();
    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "Assunto e mensagem obrigatórios" }, { status: 400 });
    }

    const ticket = await (prisma as any).supportTicket.create({
      data: {
        groupId: user.groupId,
        userId: user.id,
        subject: subject.trim(),
        message: message.trim(),
        priority: priority ?? "NORMAL",
        status: "OPEN",
      },
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — atualizar status (SUPERADMIN)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || user?.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { id, status } = await req.json();
    if (!id || !status) return NextResponse.json({ error: "id e status obrigatórios" }, { status: 400 });

    const ticket = await (prisma as any).supportTicket.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
