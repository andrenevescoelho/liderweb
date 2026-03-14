export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();

  const name = String(body.name ?? "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const type = body.type;
  const discountPercent = body.discountPercent ? Number(body.discountPercent) : null;
  const freePlanTier = body.freePlanTier || null;
  const freePlanDurationDays = body.freePlanDurationDays ? Number(body.freePlanDurationDays) : null;
  const maxUses = body.maxUses ? Number(body.maxUses) : null;
  const validFrom = body.validFrom ? new Date(body.validFrom) : null;
  const validUntil = body.validUntil ? new Date(body.validUntil) : null;
  const isActive = body.isActive !== false;
  const allowedPlanTiers = Array.isArray(body.allowedPlanTiers) ? body.allowedPlanTiers : [];

  if (!name || !type) {
    return NextResponse.json({ error: "Nome e tipo são obrigatórios" }, { status: 400 });
  }

  if (type === "PERCENTAGE_DISCOUNT") {
    if (discountPercent === null || Number.isNaN(discountPercent) || discountPercent <= 0 || discountPercent > 100) {
      return NextResponse.json({ error: "Percentual deve estar entre 1 e 100" }, { status: 400 });
    }
  }

  if (type === "FREE_PLAN") {
    if (!freePlanTier || !freePlanDurationDays || Number.isNaN(freePlanDurationDays) || freePlanDurationDays <= 0) {
      return NextResponse.json({ error: "Plano gratuito e duração em dias são obrigatórios" }, { status: 400 });
    }
  }

  if (validFrom && validUntil && validFrom > validUntil) {
    return NextResponse.json({ error: "Data inicial não pode ser maior que data final" }, { status: 400 });
  }

  const coupon = await prisma.coupon.update({
    where: { id: params.id },
    data: {
      name,
      description,
      type,
      discountPercent: type === "PERCENTAGE_DISCOUNT" ? discountPercent : null,
      freePlanTier: type === "FREE_PLAN" ? freePlanTier : null,
      freePlanDurationDays: type === "FREE_PLAN" ? freePlanDurationDays : null,
      maxUses,
      validFrom,
      validUntil,
      isActive,
      allowedPlanTiers,
    },
  });

  return NextResponse.json({ coupon });
}
