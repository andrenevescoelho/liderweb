import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    const userId = (session?.user as any)?.id;
    const sessionId = (session?.user as any)?.sessionId;

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const token = String(body?.token || "").trim();
    const platform = String(body?.platform || "android").trim();

    if (!token) {
      return NextResponse.json({ error: "Token não informado" }, { status: 400 });
    }

    const data: any = {
      pushToken: token,
      pushPlatform: platform,
      lastSeenAt: new Date(),
    };

    if (sessionId) {
      const updated = await (prisma as any).userActiveSession.updateMany({
        where: {
          userId,
          sessionId,
        },
        data,
      });

      if (updated.count > 0) {
        return NextResponse.json({ ok: true });
      }
    }

    const latestSession = await (prisma as any).userActiveSession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!latestSession) {
      return NextResponse.json(
        { error: "Sessão ativa não encontrada" },
        { status: 404 }
      );
    }

    await (prisma as any).userActiveSession.update({
      where: { id: latestSession.id },
      data,
    });

    return NextResponse.json({ ok: true, fallback: true });
  } catch (err) {
    console.error("[push/register] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao registrar push" },
      { status: 500 }
    );
  }
}