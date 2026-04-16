export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// POST /api/splits/purchase
// Cria checkout Stripe para compra de split do acervo
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    const user = session.user as any;
    if (!user.groupId) return NextResponse.json({ error: "Sem grupo" }, { status: 400 });

    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId obrigatório" }, { status: 400 });

    const origin = req.headers.get("origin") || "https://liderweb.multitrackgospel.com";

    // Buscar split original
    const originalJob = await (prisma as any).splitJob.findFirst({
      where: { id: jobId, status: "DONE", isPublic: true },
      include: { stems: true },
    });

    if (!originalJob) {
      return NextResponse.json({ error: "Split não encontrado ou não disponível" }, { status: 404 });
    }
    if (originalJob.groupId === user.groupId) {
      return NextResponse.json({ error: "Este split já é do seu grupo" }, { status: 400 });
    }

    // Verificar se já possui
    const existing = await (prisma as any).splitJob.findFirst({
      where: { groupId: user.groupId, songName: originalJob.songName, status: "DONE" },
    });
    if (existing) {
      return NextResponse.json({ error: "Você já possui um split desta música" }, { status: 409 });
    }

    const priceInCents = originalJob.priceInCents ?? 490;

    // Criar pedido no banco
    const order = await (prisma as any).order.create({
      data: {
        groupId:     user.groupId,
        userId:      user.id,
        status:      "PENDING",
        totalAmount: priceInCents / 100,
        currency:    "BRL",
        gateway:     "STRIPE",
      },
    });

    // Criar checkout session no Stripe (pagamento único)
    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: user.email,
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "brl",
          unit_amount: priceInCents,
          product_data: {
            name: `Split do Acervo — ${originalJob.songName}`,
            description: `${originalJob.stems.length} stems · ${originalJob.artistName ?? "Artista desconhecido"} · Acesso permanente`,
          },
        },
        quantity: 1,
      }],
      success_url: `${origin}/splits?purchase=success&jobId=${originalJob.id}`,
      cancel_url:  `${origin}/splits?purchase=canceled`,
      metadata: {
        groupId:     user.groupId,
        userId:      user.id,
        orderId:     order.id,
        splitJobId:  originalJob.id, // id do job original
        type:        "SPLIT_ACCESS",
      },
    });

    // Atualizar pedido com ID da sessão
    await (prisma as any).order.update({
      where: { id: order.id },
      data: { externalId: checkoutSession.id },
    });

    return NextResponse.json({ url: checkoutSession.url, orderId: order.id });
  } catch (err: any) {
    console.error("[splits/purchase] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
