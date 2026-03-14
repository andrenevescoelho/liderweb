export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (!session || user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json();

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive deve ser boolean" }, { status: 400 });
  }

  const coupon = await prisma.coupon.update({
    where: { id: params.id },
    data: { isActive: body.isActive },
  });

  return NextResponse.json({ coupon });
}
