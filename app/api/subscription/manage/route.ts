export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/types";
import { SUBSCRIPTION_PLANS } from "@/lib/stripe";

// GET - Buscar planos disponíveis
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser;

    if (!session || user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    await Promise.all(
      SUBSCRIPTION_PLANS.map(async (catalogPlan) => {
        const existingPlan = await prisma.subscriptionPlan.findFirst({
          where: { name: catalogPlan.name },
        });

        if (existingPlan) {
          await prisma.subscriptionPlan.update({
            where: { id: existingPlan.id },
            data: {
              price: catalogPlan.price,
              userLimit: catalogPlan.userLimit,
              features: catalogPlan.features,
              active: true,
            },
          });
          return;
        }

        await prisma.subscriptionPlan.create({
          data: {
            name: catalogPlan.name,
            stripePriceId: catalogPlan.isFree ? "free_plan" : `catalog_${catalogPlan.id}`,
            price: catalogPlan.price,
            userLimit: catalogPlan.userLimit,
            features: catalogPlan.features,
            active: true,
          },
        });
      })
    );

    const plans = await prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: "asc" },
    });

    return NextResponse.json(plans);
  } catch (error: any) {
    console.error("Get plans error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Adicionar assinatura a um grupo
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser;

    if (!session || user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { groupId, planId, status } = await req.json();

    if (!groupId || !planId) {
      return NextResponse.json(
        { error: "groupId e planId são obrigatórios" },
        { status: 400 }
      );
    }

    // Verificar se o grupo existe
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { subscription: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
    }

    if (group.subscription) {
      return NextResponse.json(
        { error: "Este grupo já possui uma assinatura" },
        { status: 400 }
      );
    }

    // Verificar se o plano existe
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
    }

    // Criar assinatura
    const subscription = await prisma.subscription.create({
      data: {
        groupId,
        planId,
        status: status || "ACTIVE",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
      },
      include: {
        group: {
          include: {
            _count: { select: { users: true } },
          },
        },
        plan: true,
      },
    });

    return NextResponse.json(subscription, { status: 201 });
  } catch (error: any) {
    console.error("Create subscription error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Atualizar/trocar plano de uma assinatura
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser;

    if (!session || user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { subscriptionId, planId, status, extendDays } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "subscriptionId é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se a assinatura existe
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Assinatura não encontrada" },
        { status: 404 }
      );
    }

    const updateData: any = {};

    // Atualizar plano se fornecido
    if (planId) {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });
      if (!plan) {
        return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
      }
      updateData.planId = planId;
    }

    // Atualizar status se fornecido
    if (status) {
      updateData.status = status;
      if (status === "CANCELED") {
        updateData.cancelAtPeriodEnd = true;
      } else if (status === "ACTIVE") {
        updateData.cancelAtPeriodEnd = false;
      }
    }

    // Estender período se fornecido
    if (extendDays && extendDays > 0) {
      const currentEnd = subscription.currentPeriodEnd || new Date();
      updateData.currentPeriodEnd = new Date(
        currentEnd.getTime() + extendDays * 24 * 60 * 60 * 1000
      );
    }

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
      include: {
        group: {
          include: {
            _count: { select: { users: true } },
          },
        },
        plan: true,
      },
    });

    return NextResponse.json(updatedSubscription);
  } catch (error: any) {
    console.error("Update subscription error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Remover assinatura de um grupo
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as SessionUser;

    if (!session || user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { subscriptionId } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "subscriptionId é obrigatório" },
        { status: 400 }
      );
    }

    // Verificar se a assinatura existe
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Assinatura não encontrada" },
        { status: 404 }
      );
    }

    await prisma.subscription.delete({
      where: { id: subscriptionId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete subscription error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
