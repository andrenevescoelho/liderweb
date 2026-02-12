export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      // Se não tiver webhook secret configurado, aceitar o evento (para testes)
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } else {
        event = JSON.parse(body) as Stripe.Event;
      }
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log("Webhook event received:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const groupId = session.metadata?.groupId;
  const planId = session.metadata?.planId;

  if (!groupId || !planId) {
    console.error("Missing metadata in checkout session");
    return;
  }

  const subscriptionId = session.subscription as string;

  // Buscar detalhes da assinatura no Stripe
  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId) as any;

  await prisma.subscription.upsert({
    where: { groupId },
    create: {
      groupId,
      planId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      status: stripeSubscription.status === "trialing" ? "TRIALING" : "ACTIVE",
      currentPeriodStart: new Date((stripeSubscription.current_period_start || 0) * 1000),
      currentPeriodEnd: new Date((stripeSubscription.current_period_end || 0) * 1000),
      trialEndsAt: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null,
    },
    update: {
      planId,
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscriptionId,
      status: stripeSubscription.status === "trialing" ? "TRIALING" : "ACTIVE",
      currentPeriodStart: new Date((stripeSubscription.current_period_start || 0) * 1000),
      currentPeriodEnd: new Date((stripeSubscription.current_period_end || 0) * 1000),
      trialEndsAt: stripeSubscription.trial_end
        ? new Date(stripeSubscription.trial_end * 1000)
        : null,
    },
  });

  console.log(`Subscription created/updated for group ${groupId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const sub = subscription as any;
  const groupId = sub.metadata?.groupId;

  if (!groupId) {
    // Tentar encontrar pelo stripeSubscriptionId
    const existingSub = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!existingSub) {
      console.error("Subscription not found for update");
      return;
    }

    let status: any = "ACTIVE";
    if (sub.status === "trialing") status = "TRIALING";
    else if (sub.status === "canceled") status = "CANCELED";
    else if (sub.status === "past_due") status = "PAST_DUE";
    else if (sub.status === "unpaid") status = "UNPAID";

    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status,
        currentPeriodStart: new Date((sub.current_period_start || 0) * 1000),
        currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });

    return;
  }

  let status: any = "ACTIVE";
  if (sub.status === "trialing") status = "TRIALING";
  else if (sub.status === "canceled") status = "CANCELED";
  else if (sub.status === "past_due") status = "PAST_DUE";
  else if (sub.status === "unpaid") status = "UNPAID";

  await prisma.subscription.update({
    where: { groupId },
    data: {
      stripeSubscriptionId: subscription.id,
      status,
      currentPeriodStart: new Date((sub.current_period_start || 0) * 1000),
      currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });

  console.log(`Subscription updated for group ${groupId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!existingSub) {
    console.error("Subscription not found for deletion");
    return;
  }

  await prisma.subscription.update({
    where: { id: existingSub.id },
    data: {
      status: "CANCELED",
      cancelAtPeriodEnd: false,
    },
  });

  console.log(`Subscription canceled for subscription ${subscription.id}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const subscriptionId = inv.subscription as string;
  if (!subscriptionId) return;

  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (existingSub && existingSub.status !== "ACTIVE" && existingSub.status !== "TRIALING") {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: { status: "ACTIVE" },
    });
  }

  console.log(`Payment succeeded for subscription ${subscriptionId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as any;
  const subscriptionId = inv.subscription as string;
  if (!subscriptionId) return;

  const existingSub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: { status: "PAST_DUE" },
    });
  }

  console.log(`Payment failed for subscription ${subscriptionId}`);
}
