export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { SubscriptionStatus } from "@prisma/client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":   return "TRIALING";
    case "active":     return "ACTIVE";
    case "canceled":   return "CANCELED";
    case "past_due":   return "PAST_DUE";
    case "unpaid":     return "UNPAID";
    default:           return "INACTIVE";
  }
}

async function markWebhookProcessed(id: string, error?: string) {
  await (prisma as any).webhookEvent.update({
    where: { id },
    data: {
      status: error ? "FAILED" : "PROCESSED",
      errorMessage: error ?? null,
      processedAt: new Date(),
    },
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    event = secret
      ? stripe.webhooks.constructEvent(body, signature, secret)
      : (JSON.parse(body) as Stripe.Event);
  } catch (err: any) {
    console.error("[webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotência — ignorar eventos já processados
  let webhookLog: any;
  try {
    webhookLog = await (prisma as any).webhookEvent.create({
      data: {
        gateway: "STRIPE",
        externalId: event.id,
        eventType: event.type,
        status: "RECEIVED",
        payload: event as any,
      },
    });
  } catch (err: any) {
    // Unique constraint = evento duplicado — retornar 200 para o Stripe não retentar
    if (err.code === "P2002") {
      console.log(`[webhook] Duplicate event ignored: ${event.id}`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  // Processar o evento
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        await (prisma as any).webhookEvent.update({
          where: { id: webhookLog.id },
          data: { status: "IGNORED", processedAt: new Date() },
        });
        return NextResponse.json({ received: true, ignored: true });
    }

    await markWebhookProcessed(webhookLog.id);
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`[webhook] Error processing ${event.type}:`, err);
    await markWebhookProcessed(webhookLog.id, err.message);
    // Retornar 200 para não causar retries desnecessários em erros de lógica
    return NextResponse.json({ received: true, error: err.message });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const groupId = session.metadata?.groupId;
  const billingPlanId = session.metadata?.billingPlanId;
  const planSlug = session.metadata?.planSlug;

  if (!groupId) {
    console.error("[webhook] checkout.session.completed: missing groupId in metadata");
    return;
  }

  const subscriptionId = session.subscription as string;
  if (!subscriptionId) return;

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId) as any;
  const status = mapStripeStatus(stripeSub.status);

  // Buscar ou criar o plano legado para compatibilidade
  let legacyPlanId: string | null = null;
  if (billingPlanId) {
    const billingPlan = await (prisma as any).billingPlan.findUnique({
      where: { id: billingPlanId },
    });
    if (billingPlan) {
      let legacyPlan = await prisma.subscriptionPlan.findFirst({
        where: { name: billingPlan.name },
      });
      if (!legacyPlan) {
        legacyPlan = await prisma.subscriptionPlan.create({
          data: {
            name: billingPlan.name,
            stripePriceId: `billing_v2_${billingPlan.slug}`,
            price: billingPlan.price,
            userLimit: billingPlan.userLimit,
            features: [],
          },
        });
      }
      legacyPlanId = legacyPlan.id;
    }
  }

  if (!legacyPlanId) {
    const fallback = await prisma.subscriptionPlan.findFirst();
    legacyPlanId = fallback?.id ?? "";
  }

  await (prisma as any).subscription.upsert({
    where: { groupId },
    create: {
      groupId,
      planId: legacyPlanId,
      billingPlanId: billingPlanId ?? null,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    },
    update: {
      planId: legacyPlanId,
      billingPlanId: billingPlanId ?? undefined,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    },
  });

  console.log(`[webhook] Subscription activated for group ${groupId} (plan: ${planSlug})`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const sub = subscription as any;
  const status = mapStripeStatus(sub.status);

  const existing = await (prisma as any).subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!existing) {
    console.warn(`[webhook] subscription.updated: not found for ${subscription.id}`);
    return;
  }

  await (prisma as any).subscription.update({
    where: { id: existing.id },
    data: {
      status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    },
  });

  console.log(`[webhook] Subscription updated: ${subscription.id} → ${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existing = await (prisma as any).subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!existing) {
    console.warn(`[webhook] subscription.deleted: not found for ${subscription.id}`);
    return;
  }

  await (prisma as any).subscription.update({
    where: { id: existing.id },
    data: { status: "CANCELED", cancelAtPeriodEnd: false },
  });

  console.log(`[webhook] Subscription canceled: ${subscription.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const subscriptionId = inv.subscription as string;
  if (!subscriptionId) return;

  const existing = await (prisma as any).subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (existing && !["ACTIVE", "TRIALING"].includes(existing.status)) {
    await (prisma as any).subscription.update({
      where: { id: existing.id },
      data: { status: "ACTIVE" },
    });
  }

  // Registrar transação no histórico
  if (existing && inv.amount_paid > 0) {
    await (prisma as any).paymentTransaction.upsert({
      where: { gateway_externalId: { gateway: "STRIPE", externalId: inv.id } },
      create: {
        groupId: existing.groupId,
        billingPlanId: existing.billingPlanId ?? null,
        gateway: "STRIPE",
        externalId: inv.id,
        externalSubscriptionId: subscriptionId,
        status: "SUCCEEDED",
        amount: inv.amount_paid / 100,
        currency: inv.currency.toUpperCase(),
        description: inv.description ?? `Fatura ${inv.number ?? inv.id}`,
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : new Date(),
        gatewayData: { invoiceUrl: inv.hosted_invoice_url, invoicePdf: inv.invoice_pdf },
      },
      update: {
        status: "SUCCEEDED",
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : new Date(),
      },
    });
  }

  console.log(`[webhook] Payment succeeded: ${inv.id} (${inv.amount_paid / 100} BRL)`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const subscriptionId = inv.subscription as string;
  if (!subscriptionId) return;

  const existing = await (prisma as any).subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (existing) {
    await (prisma as any).subscription.update({
      where: { id: existing.id },
      data: { status: "PAST_DUE" },
    });

    // Registrar falha no histórico
    await (prisma as any).paymentTransaction.upsert({
      where: { gateway_externalId: { gateway: "STRIPE", externalId: inv.id } },
      create: {
        groupId: existing.groupId,
        billingPlanId: existing.billingPlanId ?? null,
        gateway: "STRIPE",
        externalId: inv.id,
        externalSubscriptionId: subscriptionId,
        status: "FAILED",
        amount: inv.amount_due / 100,
        currency: inv.currency.toUpperCase(),
        description: `Falha de pagamento — ${inv.number ?? inv.id}`,
        failedAt: new Date(),
        failureReason: inv.last_finalization_error?.message ?? "Pagamento recusado",
      },
      update: {
        status: "FAILED",
        failedAt: new Date(),
      },
    });
  }

  console.log(`[webhook] Payment failed: ${inv.id}`);
}
