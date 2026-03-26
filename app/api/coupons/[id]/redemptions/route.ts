export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      code: true,
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        include: {
          subscription: {
            include: {
              group: { select: { id: true, name: true } },
            },
          },
          redeemedByUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!coupon) {
    return NextResponse.json({ error: "Cupom não encontrado" }, { status: 404 });
  }

  const now = Date.now();
  const redemptions = coupon.redemptions.map((redemption) => {
    const msRemaining = redemption.benefitEndAt
      ? new Date(redemption.benefitEndAt).getTime() - now
      : null;

    return {
      id: redemption.id,
      status: redemption.status,
      redeemedAt: redemption.redeemedAt,
      benefitStartAt: redemption.benefitStartAt,
      benefitEndAt: redemption.benefitEndAt,
      daysRemaining: msRemaining === null ? null : Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000))),
      ministry: redemption.subscription.group,
      redeemedByUser: redemption.redeemedByUser,
    };
  });

  return NextResponse.json({
    coupon: { id: coupon.id, code: coupon.code },
    redemptions,
  });
}
