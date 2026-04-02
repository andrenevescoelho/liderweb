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

// GET — listar tickets
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const ticketId = searchParams.get("id");

    // SUPERADMIN vê todos os tickets da plataforma
    if (user.role === "SUPERADMIN") {
      if (ticketId) {
        const ticket = await (prisma as any).supportTicket.findUnique({
          where: { id: ticketId },
          include: {
            user: { select: { name: true, email: true } },
            group: { select: { name: true } },
            replies: {
              include: { author: { select: { id: true, name: true, role: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        });
        return NextResponse.json({ ticket });
      }
      const where: any = {};
      if (statusFilter && statusFilter !== "all") where.status = statusFilter;
      const tickets = await (prisma as any).supportTicket.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          user: { select: { name: true, email: true } },
          group: { select: { name: true } },
          replies: { select: { id: true }, take: 1 },
        },
      });
      const stats = {
        open: tickets.filter((t: any) => t.status === "OPEN").length,
        inProgress: tickets.filter((t: any) => t.status === "IN_PROGRESS").length,
        resolved: tickets.filter((t: any) => t.status === "RESOLVED").length,
        total: tickets.length,
      };
      return NextResponse.json({ tickets, stats });
    }

    // Usuário normal vê apenas seus tickets
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    if (ticketId) {
      const ticket = await (prisma as any).supportTicket.findFirst({
        where: { id: ticketId, groupId: user.groupId },
        include: {
          replies: {
            where: { isInternal: false },
            include: { author: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return NextResponse.json({ ticket });
    }

    const tickets = await (prisma as any).supportTicket.findMany({
      where: { groupId: user.groupId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        replies: { where: { isInternal: false }, select: { id: true } },
      },
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

// PATCH — atualizar status + responder (SUPERADMIN ou dono do ticket)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser | undefined;
    if (!session || !user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();
    const { id, status, reply, isInternal } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    // Adicionar resposta
    if (reply?.trim()) {
      const isSuperAdmin = user.role === "SUPERADMIN";
      // Verificar acesso ao ticket
      const ticket = await (prisma as any).supportTicket.findFirst({
        where: isSuperAdmin ? { id } : { id, groupId: user.groupId },
      });
      if (!ticket) return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });

      const newReply = await (prisma as any).supportTicketReply.create({
        data: {
          ticketId: id,
          authorId: user.id,
          message: reply.trim(),
          isInternal: isSuperAdmin && isInternal === true,
        },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      // Se SUPERADMIN respondeu, mudar status para IN_PROGRESS automaticamente
      if (isSuperAdmin && ticket.status === "OPEN") {
        await (prisma as any).supportTicket.update({
          where: { id },
          data: { status: "IN_PROGRESS" },
        });
      }

      return NextResponse.json({ reply: newReply });
    }

    // Apenas SUPERADMIN muda status
    if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    if (!status) return NextResponse.json({ error: "status obrigatório" }, { status: 400 });

    const ticket = await (prisma as any).supportTicket.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
