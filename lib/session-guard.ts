import { prisma } from "@/lib/db";

// Cache simples do timeout global em memória (recarrega a cada 5 min)
let globalTimeoutCache: { hours: number | null; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getGlobalTimeoutHours(): Promise<number | null> {
  const now = Date.now();
  if (globalTimeoutCache && now - globalTimeoutCache.loadedAt < CACHE_TTL_MS) {
    return globalTimeoutCache.hours;
  }
  try {
    const config = await (prisma as any).systemConfig.findUnique({
      where: { key: "session_timeout_hours" },
      select: { value: true },
    });
    const hours = config ? parseInt(config.value) || null : null;
    globalTimeoutCache = { hours, loadedAt: now };
    return hours;
  } catch {
    return null;
  }
}

export function invalidateSessionTimeoutCache() {
  globalTimeoutCache = null;
}

/**
 * Verifica se o sessionId do JWT ainda está ativo no banco.
 * Aplica timeout por inatividade se configurado (global ou por usuário).
 * Retorna true se válido, false se revogado ou expirado.
 * Nunca lança exceção — em caso de erro retorna true (fail open).
 */
export async function isSessionValid(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return true;

  try {
    const session = await (prisma as any).userActiveSession.findUnique({
      where: { sessionId },
      select: { id: true, userId: true, lastSeenAt: true },
    });

    if (!session) return false;

    // ── Verificar timeout por inatividade ──────────────────────────────────────
    const now = Date.now();
    const lastSeen = new Date(session.lastSeenAt).getTime();
    const idleMs = now - lastSeen;

    // Buscar timeout do usuário ou global
    let timeoutHours: number | null = null;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { sessionTimeoutHours: true },
    });

    timeoutHours = user?.sessionTimeoutHours ?? null;

    // Fallback para configuração global se usuário não tem timeout específico
    if (timeoutHours === null) {
      timeoutHours = await getGlobalTimeoutHours();
    }

    if (timeoutHours !== null && timeoutHours > 0) {
      const timeoutMs = timeoutHours * 60 * 60 * 1000;
      if (idleMs > timeoutMs) {
        // Sessão expirada por inatividade — remover do banco
        (prisma as any).userActiveSession.delete({
          where: { sessionId },
        }).catch(() => {});
        return false;
      }
    }

    // Atualizar lastSeenAt em background
    (prisma as any).userActiveSession.update({
      where: { sessionId },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});

    return true;
  } catch {
    return true; // fail open
  }
}
