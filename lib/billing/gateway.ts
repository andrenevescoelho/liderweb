/**
 * lib/billing/gateway.ts
 *
 * Camada de abstração de gateways de pagamento.
 * O restante do sistema nunca fala diretamente com o Stripe —
 * sempre passa por aqui. Isso permite adicionar Asaas, Mercado Pago
 * etc. sem alterar nenhuma outra parte do código.
 */

import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export type GatewayName = "STRIPE" | "ASAAS" | "MERCADO_PAGO" | "MANUAL";

export interface CreateCheckoutParams {
  gateway: GatewayName;
  priceExternalId: string;       // price_id no Stripe, external_id no Asaas, etc.
  customerEmail: string;
  trialDays?: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutResult {
  url: string;
  externalSessionId: string;
}

export interface CreatePortalParams {
  gateway: GatewayName;
  stripeCustomerId: string;
  returnUrl: string;
}

export interface PortalResult {
  url: string;
}

export interface InvoiceHistoryItem {
  id: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void" | "uncollectible";
  description: string | null;
  paidAt: Date | null;
  invoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  if (params.gateway === "STRIPE") {
    return createStripeCheckout(params);
  }
  throw new Error(`Gateway "${params.gateway}" não suportado ainda para checkout.`);
}

async function createStripeCheckout(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  const session = await stripe.checkout.sessions.create({
    customer_email: params.customerEmail,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{ price: params.priceExternalId, quantity: 1 }],
    subscription_data: {
      trial_period_days: params.trialDays && params.trialDays > 0
        ? params.trialDays
        : undefined,
      metadata: params.metadata ?? {},
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata ?? {},
  });

  return {
    url: session.url!,
    externalSessionId: session.id,
  };
}

// ─── Portal ──────────────────────────────────────────────────────────────────

export async function createBillingPortal(
  params: CreatePortalParams
): Promise<PortalResult> {
  if (params.gateway === "STRIPE") {
    return createStripePortal(params);
  }
  throw new Error(`Gateway "${params.gateway}" não suportado para portal.`);
}

async function createStripePortal(
  params: CreatePortalParams
): Promise<PortalResult> {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

// ─── Histórico de faturas ─────────────────────────────────────────────────────

export async function getInvoiceHistory(
  gateway: GatewayName,
  stripeCustomerId: string,
  limit = 10
): Promise<InvoiceHistoryItem[]> {
  if (gateway === "STRIPE") {
    return getStripeInvoiceHistory(stripeCustomerId, limit);
  }
  // Fallback: buscar do banco local
  return getLocalTransactionHistory(stripeCustomerId, limit);
}

async function getStripeInvoiceHistory(
  customerId: string,
  limit: number
): Promise<InvoiceHistoryItem[]> {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    return invoices.data.map((inv: any) => ({
      id: inv.id,
      amount: inv.amount_paid / 100,
      currency: inv.currency.toUpperCase(),
      status: inv.status as InvoiceHistoryItem["status"],
      description: inv.description ?? inv.lines?.data?.[0]?.description ?? null,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,
      invoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
    }));
  } catch {
    return [];
  }
}

async function getLocalTransactionHistory(
  groupId: string,
  limit: number
): Promise<InvoiceHistoryItem[]> {
  const transactions = await (prisma as any).paymentTransaction.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return transactions.map((t: any) => ({
    id: t.id,
    amount: t.amount,
    currency: t.currency,
    status: t.status === "SUCCEEDED" ? "paid" : "open",
    description: t.description,
    paidAt: t.paidAt,
    invoiceUrl: null,
    invoicePdf: null,
    periodStart: null,
    periodEnd: null,
  }));
}

// ─── Cancelamento ─────────────────────────────────────────────────────────────

export async function cancelSubscription(
  gateway: GatewayName,
  externalSubscriptionId: string,
  atPeriodEnd = true
): Promise<void> {
  if (gateway === "STRIPE") {
    await stripe.subscriptions.update(externalSubscriptionId, {
      cancel_at_period_end: atPeriodEnd,
    });
    return;
  }
  throw new Error(`Cancelamento via "${gateway}" não suportado ainda.`);
}

// ─── Reativação ───────────────────────────────────────────────────────────────

export async function reactivateSubscription(
  gateway: GatewayName,
  externalSubscriptionId: string
): Promise<void> {
  if (gateway === "STRIPE") {
    // cancel_at_period_end cobre cancelamentos normais
    // cancel_at: "" remove cancelamentos agendados por data (ex: durante trial)
    await stripe.subscriptions.update(externalSubscriptionId, {
      cancel_at_period_end: false,
      cancel_at: "" as any, // remove data absoluta de cancelamento
    });
    return;
  }
  throw new Error(`Reativação via "${gateway}" não suportada ainda.`);
}
