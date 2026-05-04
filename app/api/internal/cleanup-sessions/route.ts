export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidInternalRequest, unauthorizedResponse } from "@/lib/internal-auth";

// POST /api/internal/cleanup-sessions
// Chamado pelo n8n periodicamente — apaga sessões inativas
// Body (opcional): { hoursInactive: 24, dryRun: false }

export async function POST(req: NextRequest) {
  if (!isValidInternalRequest(req)) return unauthorizedResponse();

  const body = await req.json().catch(() => ({}));
  const { hoursInactive = 24, dryRun = false } = body;

  if (typeof hoursInactive !== "number" || hoursInactive < 1) {
    return NextResponse.json({ error: "hoursInactive deve ser >= 1" }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - hoursInactive * 60 * 60 * 1000);

  try {
    // Contar antes de apagar (útil tanto para dryRun quanto para o log)
    const count = await (prisma as any).userActiveSession.count({
      where: { lastSeenAt: { lt: cutoff } },
    });

    if (!dryRun && count > 0) {
      await (prisma as any).userActiveSession.deleteMany({
        where: { lastSeenAt: { lt: cutoff } },
      });
    }

    // Estatísticas pós-limpeza
    const remaining = await (prisma as any).userActiveSession.count();

    console.log(
      `[cleanup-sessions] ${dryRun ? "DRY RUN" : "OK"} — ` +
      `deletadas: ${count} | cutoff: ${cutoff.toISOString()} | restantes: ${remaining}`
    );

    return NextResponse.json({
      dryRun,
      hoursInactive,
      cutoff: cutoff.toISOString(),
      deleted: dryRun ? 0 : count,
      wouldDelete: count,
      remaining,
      message: dryRun
        ? `Simulação: ${count} sessão(ões) inativas por mais de ${hoursInactive}h seriam removidas`
        : `${count} sessão(ões) removidas. ${remaining} sessão(ões) ativas restantes.`,
    });
  } catch (error: any) {
    console.error("[cleanup-sessions] erro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
