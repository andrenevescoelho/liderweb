export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;

    const body = await req.json();
    const { planSlug } = body; // agora usamos slug em vez de planId hardcoded

    if (!planSlug) {
      return NextResponse.json({ error: "planSlug obrigatório" }, { status: 400 });
    }

    // Buscar plano dinâmico pelo slug
    const plan = await (prisma as any).billingPlan.findUnique({
      where: { slug: planSlug },
      include: {
        gatewayMappings: {
          where: { isActive: true },
        },
      },
    });

    if (!plan || plan.status !== "ACTIVE") {
      return NextResponse.json({ error: "Plano não encontrado ou inativo" }, { status: 404 });
    }

    // Usuário não logado ou sem grupo — precisa criar conta primeiro
    if (!session || !user?.groupId) {
      return NextResponse.json({ needsAccount: true, planSlug });
    }

    // Apenas ADMIN ou SUPERADMIN podem gerenciar assinaturas
    if (user.role !== "SUPERADMIN" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Apenas administradores podem gerenciar assinaturas" },
        { status: 403 }
      );
    }

    const origin = req.headers.get("origin") || "https://liderweb.multitrackgospel.com";

    // Plano gratuito — ativar diretamente sem Stripe
    const isFree = plan.price === 0;
    if (isFree) {
      const group = await prisma.group.findUnique({
        where: { id: user.groupId },
        include: { subscription: true },
      });
      if (!group) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

      // Buscar ou criar o SubscriptionPlan legado para compatibilidade
      let legacyPlan = await prisma.subscriptionPlan.findFirst({
        where: { name: plan.name },
      });
      if (!legacyPlan) {
        legacyPlan = await prisma.subscriptionPlan.create({
          data: {
            name: plan.name,
            stripePriceId: "free_plan",
            price: 0,
            userLimit: plan.userLimit,
            features: [],
          },
        });
      }

      if (group.subscription) {
        await prisma.subscription.update({
          where: { id: group.subscription.id },
          data: {
            planId: legacyPlan.id,
            billingPlanId: plan.id,
            status: "ACTIVE",
            stripeSubscriptionId: null,
            currentPeriodEnd: null,
          } as any,
        });
      } else {
        await (prisma as any).subscription.create({
          data: {
            groupId: group.id,
            planId: legacyPlan.id,
            billingPlanId: plan.id,
            status: "ACTIVE",
          },
        });
      }

      return NextResponse.json({ url: `${origin}/dashboard?subscription=activated` });
    }

    // Plano pago — buscar mapeamento do Stripe
    const stripeMapping = plan.gatewayMappings.find(
      (m: any) => m.gateway === "STRIPE"
    );

    if (!stripeMapping) {
      return NextResponse.json(
        { error: "Este plano não possui configuração de pagamento ativa. Entre em contato com o suporte." },
        { status: 400 }
      );
    }

    const stripePriceId = stripeMapping.externalId;

    // Criar checkout session no Stripe sem reutilizar customer antigo
    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: user.email,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: plan.trialDays > 0 ? plan.trialDays : undefined,
        metadata: {
          groupId: user.groupId,
          billingPlanId: plan.id,
          planSlug: plan.slug,
        },
      },
      success_url: `${origin}/dashboard?subscription=success`,
      cancel_url: `${origin}/planos?canceled=true`,
      metadata: {
        groupId: user.groupId,
        billingPlanId: plan.id,
        planSlug: plan.slug,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("[billing/checkout] POST error:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao criar sessão de checkout" },
      { status: 500 }
    );
  }
}
