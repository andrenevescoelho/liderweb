/**
 * Configurações de envio de email gerenciadas pelo SUPERADMIN.
 * As configs são armazenadas no banco e cacheadas em memória por 5 minutos.
 */

import { prisma } from "@/lib/db";

// ─── Definição de todos os emails configuráveis ───────────────────────────────

export const EMAIL_CONFIG_DEFINITIONS = [
  // Contas
  {
    key: "new_account",
    label: "Nova conta criada",
    description: "Enviado para o SUPERADMIN quando um novo ministério se cadastra",
    category: "Contas",
    defaultEnabled: true,
  },
  {
    key: "invite_member",
    label: "Convite de membro",
    description: "Enviado para o membro convidado pelo líder",
    category: "Contas",
    defaultEnabled: true,
  },
  {
    key: "password_reset",
    label: "Redefinição de senha",
    description: "Enviado ao usuário que solicitar recuperação de senha",
    category: "Contas",
    defaultEnabled: true,
  },
  // Assinaturas
  {
    key: "new_subscription",
    label: "Nova assinatura",
    description: "Enviado ao admin do grupo quando assina um plano",
    category: "Assinaturas",
    defaultEnabled: true,
  },
  {
    key: "subscription_cancelled",
    label: "Assinatura cancelada",
    description: "Enviado ao admin do grupo quando a assinatura é cancelada",
    category: "Assinaturas",
    defaultEnabled: true,
  },
  {
    key: "subscription_expiring",
    label: "Assinatura expirando",
    description: "Lembrete enviado antes do vencimento",
    category: "Assinaturas",
    defaultEnabled: true,
  },
  // Pagamentos
  {
    key: "payment_received",
    label: "Pagamento realizado",
    description: "Confirmação de pagamento enviada ao admin do grupo",
    category: "Pagamentos",
    defaultEnabled: true,
  },
  {
    key: "payment_failed",
    label: "Falha no pagamento",
    description: "Alerta enviado ao admin do grupo quando pagamento falha",
    category: "Pagamentos",
    defaultEnabled: true,
  },
  // Escalas
  {
    key: "schedule_created",
    label: "Escala criada",
    description: "Enviado para os membros escalados quando uma escala é criada",
    category: "Escalas",
    defaultEnabled: true,
  },
  {
    key: "schedule_response",
    label: "Resposta de presença",
    description: "Enviado ao líder quando membro confirma ou recusa presença",
    category: "Escalas",
    defaultEnabled: true,
  },
] as const;

export type EmailConfigKey = typeof EMAIL_CONFIG_DEFINITIONS[number]["key"];

// ─── Cache em memória ─────────────────────────────────────────────────────────

let cache: Record<string, boolean> | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function getEmailConfigs(): Promise<Record<string, boolean>> {
  // Retornar cache se ainda válido
  if (cache && Date.now() < cacheExpiry) {
    return cache;
  }

  try {
    // Garantir que todos os registros existem no banco
    await ensureDefaultConfigs();

    const configs = await prisma.emailConfig.findMany();
    cache = {};
    for (const config of configs) {
      cache[config.key] = config.enabled;
    }
    cacheExpiry = Date.now() + CACHE_TTL;
    return cache;
  } catch (error) {
    console.error("[email-config] Erro ao buscar configs:", error);
    // Fallback: retornar tudo habilitado se banco falhar
    return EMAIL_CONFIG_DEFINITIONS.reduce((acc, def) => {
      acc[def.key] = def.defaultEnabled;
      return acc;
    }, {} as Record<string, boolean>);
  }
}

export async function isEmailEnabled(key: EmailConfigKey): Promise<boolean> {
  const configs = await getEmailConfigs();
  return configs[key] ?? true; // padrão: habilitado
}

export function invalidateEmailConfigCache() {
  cache = null;
  cacheExpiry = 0;
}

async function ensureDefaultConfigs() {
  const existing = await prisma.emailConfig.findMany({
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((c) => c.key));

  const missing = EMAIL_CONFIG_DEFINITIONS.filter(
    (def) => !existingKeys.has(def.key)
  );

  if (missing.length > 0) {
    await prisma.emailConfig.createMany({
      data: missing.map((def) => ({
        key: def.key,
        label: def.label,
        category: def.category,
        enabled: def.defaultEnabled,
      })),
      skipDuplicates: true,
    });
  }
}
