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

    if (!session || !user?.groupId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Se não for admin, permitir apenas quando o grupo não tiver nenhum administrador.
    if (user.role !== "SUPERADMIN" && user.role !== "ADMIN") {
      const groupAdmin = await prisma.user.findFirst({
        where: {
          groupId: user.groupId,
          role: { in: ["SUPERADMIN", "ADMIN"] },
        },
        select: { id: true },
      });

      if (groupAdmin) {
        return NextResponse.json(
          { error: "Apenas administradores podem gerenciar assinaturas" },
          { status: 403 }
        );
      }
    }

    const subscription = await prisma.subscription.findUnique({
      where: { groupId: user.groupId },
    });

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "Nenhuma assinatura encontrada" },
        { status: 404 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/meu-plano`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: error.message || "Erro ao criar portal" },
      { status: 500 }
    );
  }
}
