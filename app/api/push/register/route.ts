export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

// POST /api/push/register — salva token FCM
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { token, platform } = await req.json();
  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  await (prisma as any).userActiveSession.updateMany({
    where: { userId: user.id },
    data: { pushToken: token, pushPlatform: platform ?? "android" },
  }).catch(() => {});

  console.log(`[push] Token registrado para user ${user.id}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/push/register — remove token ao fazer logout
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ ok: true });

  await (prisma as any).userActiveSession.updateMany({
    where: { userId: user.id },
    data: { pushToken: null },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
