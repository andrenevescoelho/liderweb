export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

const DEFAULT_PREFS: Record<string, boolean> = {
  schedule_published_push: true,  schedule_published_email: true,
  schedule_pending_push: true,    schedule_pending_email: false,
  schedule_approved_push: true,   schedule_approved_email: false,
  rehearsal_created_push: true,   rehearsal_created_email: true,
  broadcast_push: true,           broadcast_email: false,
  chat_push: true,                chat_email: false,
  dm_push: true,                  dm_email: true,
  invite_accepted_push: true,     invite_accepted_email: true,
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const result = await prisma.$queryRaw<any[]>`
      SELECT "notificationPreferences" FROM "User" WHERE id = ${user.id} LIMIT 1
    `;

    const prefs = { ...DEFAULT_PREFS, ...(result?.[0]?.notificationPreferences ?? {}) };
    return NextResponse.json(prefs);
  } catch {
    return NextResponse.json(DEFAULT_PREFS);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await req.json();

    const validKeys = Object.keys(DEFAULT_PREFS);
    const prefs: Record<string, boolean> = {};
    for (const key of validKeys) {
      if (typeof body[key] === "boolean") prefs[key] = body[key];
      else prefs[key] = DEFAULT_PREFS[key];
    }

    await prisma.$executeRaw`
      UPDATE "User" SET "notificationPreferences" = ${JSON.stringify(prefs)}::jsonb
      WHERE id = ${user.id}
    `;

    return NextResponse.json(prefs);
  } catch (e) {
    console.error("Notification preferences error:", e);
    return NextResponse.json({ error: "Erro ao salvar preferências" }, { status: 500 });
  }
}
