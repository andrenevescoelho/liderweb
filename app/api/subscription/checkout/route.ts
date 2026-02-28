export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { stripe, SUBSCRIPTION_PLANS } from "@/lib/stripe";

function isStripePriceId(value?: string | null) {
  return Boolean(value && value.startsWith("price_"));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    
    const body = await req.json();
    const { planId, groupId } = body;

    // Buscar o plano
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId) as any;
    if (!plan) {
      return NextResponse.json({ error: "Plano não encontrado" }, { status: 400 });
    }

    // Se usuário não está logado ou não tem grupo, redirecionar para signup
    if (!session || (!user?.groupId && !groupId)) {
      return NextResponse.json({ needsGroup: true, planId });
    }

    const targetGroupId = groupId || user.groupId;

    // Verificar se o usuário é admin do grupo
    if (user.role !== "SUPERADMIN" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Apenas administradores podem gerenciar assinaturas" },
        { status: 403 }
      );
    }

    // Buscar o grupo
    const group = await prisma.group.findUnique({
      where: { id: targetGroupId },
      include: { subscription: true },
    });

    if (!group) {
      return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
    }

    // Buscar ou criar plano no banco
    let dbPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: plan.name },
    });

    if (!dbPlan) {
      // Para plano gratuito, não criar no Stripe
      if (plan.isFree) {
        dbPlan = await prisma.subscriptionPlan.create({
          data: {
            name: plan.name,
            stripePriceId: "free_plan", // Identificador especial para plano gratuito
            price: 0,
            userLimit: plan.userLimit,
            features: plan.features,
          },
        });
      } else {
        // Criar produto e preço no Stripe para planos pagos
        const stripeProduct = await stripe.products.create({
          name: `Líder Web - ${plan.name}`,
          description: plan.description,
        });

        const stripePrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: Math.round(plan.price * 100), // em centavos
          currency: "brl",
          recurring: { interval: "month" },
        });

        dbPlan = await prisma.subscriptionPlan.create({
          data: {
            name: plan.name,
            stripePriceId: stripePrice.id,
            price: plan.price,
            userLimit: plan.userLimit,
            features: plan.features,
          },
        });
      }
    }

    if (!plan.isFree && !isStripePriceId(dbPlan.stripePriceId)) {
      const stripeProduct = await stripe.products.create({
        name: `Líder Web - ${plan.name}`,
        description: plan.description,
      });

      const stripePrice = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: Math.round(plan.price * 100),
        currency: "brl",
        recurring: { interval: "month" },
      });

      dbPlan = await prisma.subscriptionPlan.update({
        where: { id: dbPlan.id },
        data: { stripePriceId: stripePrice.id },
      });
    }

    // Se é plano gratuito, ativar diretamente sem Stripe
    if (plan.isFree) {
      if (group.subscription) {
        await prisma.subscription.update({
          where: { id: group.subscription.id },
          data: {
            planId: dbPlan.id,
            status: "ACTIVE",
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            groupId: group.id,
            planId: dbPlan.id,
            status: "ACTIVE",
          },
        });
      }

      const origin = req.headers.get("origin") || "http://localhost:3000";
      return NextResponse.json({ url: `${origin}/dashboard?subscription=success` });
    }

    // Para planos pagos, continuar com fluxo Stripe
    let stripeCustomerId = group.subscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: group.name,
        email: user.email,
        metadata: {
          groupId: group.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    // Criar sessão de checkout
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: dbPlan.stripePriceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          groupId: group.id,
          planId: dbPlan.id,
        },
      },
      success_url: `${origin}/dashboard?subscription=success`,
      cancel_url: `${origin}/planos?canceled=true`,
      metadata: {
        groupId: group.id,
        planId: dbPlan.id,
      },
    });

    // Atualizar ou criar assinatura no banco (status INACTIVE até confirmação do webhook)
    if (group.subscription) {
      await prisma.subscription.update({
        where: { id: group.subscription.id },
        data: {
          stripeCustomerId,
          planId: dbPlan.id,
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          groupId: group.id,
          planId: dbPlan.id,
          stripeCustomerId,
          status: "INACTIVE",
        },
      });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao criar sessão de checkout" },
      { status: 500 }
    );
  }
}
