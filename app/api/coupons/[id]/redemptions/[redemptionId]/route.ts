export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string; redemptionId: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const redemption = await prisma.couponRedemption.findUnique({
    where: { id: params.redemptionId },
    select: {
      id: true,
      couponId: true,
      status: true,
      coupon: { select: { id: true, usedCount: true } },
    },
  });

  if (!redemption || redemption.couponId !== params.id) {
    return NextResponse.json({ error: "Aplicação do cupom não encontrada" }, { status: 404 });
  }

  if (redemption.status !== "ACTIVE") {
    return NextResponse.json({ error: "Esta aplicação já está inativa" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.couponRedemption.update({
      where: { id: redemption.id },
      data: {
        status: "REVOKED",
        benefitEndAt: new Date(),
      },
    });

    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: {
        usedCount: {
          decrement: redemption.coupon.usedCount > 0 ? 1 : 0,
        },
      },
    });
  });

  return NextResponse.json({ success: true });
}
