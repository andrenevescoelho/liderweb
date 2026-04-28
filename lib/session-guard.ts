import { prisma } from "@/lib/db";

/**
 * Verifica se o sessionId do JWT ainda está ativo no banco.
 * Retorna true se válido, false se revogado.
 * Nunca lança exceção — em caso de erro retorna true (fail open).
 */
export async function isSessionValid(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return true; // sessões antigas sem sessionId são permitidas

  try {
    const session = await (prisma as any).userActiveSession.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (!session) return false;

    // Atualizar lastSeenAt em background
    (prisma as any).userActiveSession.update({
      where: { sessionId },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});

    return true;
  } catch {
    return true; // fail open — nunca bloquear por falha
  }
}
