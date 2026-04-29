import { prisma } from "@/lib/db";

/**
 * Verifica se o sessionId do JWT ainda está ativo no banco.
 * Retorna true se válido, false se revogado.
 * Nunca lança exceção — em caso de erro retorna true (fail open).
 */
// Sessão expira se não for vista há mais de 24 horas
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function isSessionValid(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return true; // sessões antigas sem sessionId são permitidas

  try {
    const session = await (prisma as any).userActiveSession.findUnique({
      where: { sessionId },
      select: { id: true, lastSeenAt: true },
    });

    if (!session) return false;

    // Verificar TTL — sessão expirada por inatividade
    const idleTime = Date.now() - new Date(session.lastSeenAt).getTime();
    if (idleTime > SESSION_TTL_MS) {
      // Remover sessão expirada do banco
      (prisma as any).userActiveSession.delete({
        where: { sessionId },
      }).catch(() => {});
      return false;
    }

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

/**
 * Limpar sessões expiradas de todos os usuários.
 * Chamar periodicamente (ex: via cron ou na inicialização).
 */
export async function cleanExpiredSessions(): Promise<void> {
  try {
    const expiredBefore = new Date(Date.now() - SESSION_TTL_MS);
    await (prisma as any).userActiveSession.deleteMany({
      where: { lastSeenAt: { lt: expiredBefore } },
    });
  } catch {
    // silencioso
  }
}
