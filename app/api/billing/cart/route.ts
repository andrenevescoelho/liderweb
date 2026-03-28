export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";

// GET — buscar carrinho aberto do grupo
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const cart = await (prisma as any).cart.findFirst({
      where: { groupId: user.groupId, status: "OPEN" },
      include: {
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!cart) {
      return NextResponse.json({ cart: null, total: 0, itemCount: 0 });
    }

    const total = cart.items.reduce(
      (sum: number, item: any) => sum + item.unitPrice * item.quantity,
      0
    );

    return NextResponse.json({ cart, total, itemCount: cart.items.length });
  } catch (error) {
    console.error("[billing/cart] GET error:", error);
    return NextResponse.json({ error: "Erro ao buscar carrinho" }, { status: 500 });
  }
}

// POST — ações no carrinho: add, remove, clear, checkout
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { action, productId, quantity, metadata } = body;
    const origin = req.headers.get("origin") || "https://liderweb.multitrackgospel.com";

    // Buscar ou criar carrinho aberto
    let cart = await (prisma as any).cart.findFirst({
      where: { groupId: user.groupId, status: "OPEN" },
      include: { items: { include: { product: true } } },
    });

    if (!cart && action !== "clear") {
      cart = await (prisma as any).cart.create({
        data: { groupId: user.groupId, userId: user.id, status: "OPEN" },
        include: { items: { include: { product: true } } },
      });
    }

    switch (action) {
      case "add": {
        if (!productId) return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });

        const product = await (prisma as any).billingProduct.findUnique({
          where: { id: productId },
          include: { gatewayMappings: { where: { isActive: true } } },
        });
        if (!product || product.status !== "ACTIVE") {
          return NextResponse.json({ error: "Produto não encontrado ou inativo" }, { status: 404 });
        }

        await (prisma as any).cartItem.upsert({
          where: { cartId_productId: { cartId: cart.id, productId } },
          create: {
            cartId: cart.id,
            productId,
            quantity: quantity ?? 1,
            unitPrice: product.price,
            metadata: metadata ?? {},
          },
          update: {
            quantity: { increment: quantity ?? 1 },
          },
        });

        break;
      }

      case "remove": {
        if (!productId) return NextResponse.json({ error: "productId obrigatório" }, { status: 400 });
        await (prisma as any).cartItem.deleteMany({
          where: { cartId: cart.id, productId },
        });
        break;
      }

      case "clear": {
        if (cart) {
          await (prisma as any).cartItem.deleteMany({ where: { cartId: cart.id } });
        }
        break;
      }

      case "checkout": {
        if (!cart || cart.items.length === 0) {
          return NextResponse.json({ error: "Carrinho vazio" }, { status: 400 });
        }

        // Montar line items para o Stripe
        const lineItems = await Promise.all(
          cart.items.map(async (item: any) => {
            const stripeMapping = item.product.gatewayMappings?.find(
              (m: any) => m.gateway === "STRIPE" && m.isActive
            );

            if (stripeMapping) {
              // Usar price_id existente no Stripe
              return { price: stripeMapping.externalId, quantity: item.quantity };
            }

            // Criar price on-the-fly
            return {
              price_data: {
                currency: "brl",
                unit_amount: Math.round(item.unitPrice * 100),
                product_data: { name: item.product.name, description: item.product.description ?? undefined },
              },
              quantity: item.quantity,
            };
          })
        );

        const totalAmount = cart.items.reduce(
          (sum: number, item: any) => sum + item.unitPrice * item.quantity,
          0
        );

        // Criar pedido no banco
        const order = await (prisma as any).order.create({
          data: {
            groupId: user.groupId,
            userId: user.id,
            status: "PENDING",
            totalAmount,
            gateway: "STRIPE",
            items: {
              create: cart.items.map((item: any) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                metadata: item.metadata,
              })),
            },
          },
        });

        // Criar checkout session no Stripe
        const checkoutSession = await stripe.checkout.sessions.create({
          customer_email: user.email,
          payment_method_types: ["card"],
          mode: "payment",
          line_items: lineItems,
          success_url: `${origin}/dashboard?order=success&orderId=${order.id}`,
          cancel_url: `${origin}/cart?canceled=true`,
          metadata: {
            groupId: user.groupId,
            orderId: order.id,
            userId: user.id,
          },
        });

        // Atualizar pedido com ID da sessão e marcar carrinho como checkout
        await (prisma as any).order.update({
          where: { id: order.id },
          data: { externalId: checkoutSession.id },
        });
        await (prisma as any).cart.update({
          where: { id: cart.id },
          data: { status: "CHECKOUT" },
        });

        return NextResponse.json({ url: checkoutSession.url, orderId: order.id });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }

    // Retornar carrinho atualizado
    const updatedCart = await (prisma as any).cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { product: true } } },
    });

    const total = updatedCart?.items.reduce(
      (sum: number, item: any) => sum + item.unitPrice * item.quantity,
      0
    ) ?? 0;

    return NextResponse.json({
      cart: updatedCart,
      total,
      itemCount: updatedCart?.items.length ?? 0,
    });
  } catch (error: any) {
    console.error("[billing/cart] POST error:", error);
    return NextResponse.json({ error: error.message || "Erro no carrinho" }, { status: 500 });
  }
}
