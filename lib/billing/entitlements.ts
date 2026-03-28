/**
 * lib/billing/entitlements.ts
 *
 * Sistema de entitlements — controle estrutural de acesso por plano.
 * Toda regra de "o que o plano permite" fica aqui.
 * O restante do sistema nunca verifica features diretamente no JSON do plano.
 */

import { prisma } from "@/lib/db";

export type FeatureKey =
  | "multitracks"      // acesso ao módulo de multitracks
  | "professor"        // acesso ao módulo professor IA
  | "splits"           // acesso a splits
  | "audio_upload"     // upload de áudio
  | "members"          // limite de membros
  | "pads"             // acesso a pads

export interface Entitlements {
  // Feature flags — booleano
  canAccessMultitracks: boolean;
  canAccessProfessor: boolean;
  canAccessSplits: boolean;
  canUploadAudio: boolean;
  canAccessPads: boolean;
  // Quotas — numérico (0 = sem acesso, -1 = ilimitado)
  multitracksPerMonth: number;
  splitsPerMonth: number;
  membersLimit: number;
  // Info do plano
  planName: string;
  planSlug: string | null;
  isActive: boolean;
  isFree: boolean;
}

const FREE_ENTITLEMENTS: Entitlements = {
  canAccessMultitracks: false,
  canAccessProfessor: false,
  canAccessSplits: false,
  canUploadAudio: false,
  canAccessPads: true,
  multitracksPerMonth: 0,
  splitsPerMonth: 0,
  membersLimit: 10,
  planName: "Gratuito",
  planSlug: "free",
  isActive: true,
  isFree: true,
};

const NO_SUBSCRIPTION_ENTITLEMENTS: Entitlements = {
  ...FREE_ENTITLEMENTS,
  isActive: false,
  planName: "Sem plano",
  planSlug: null,
};

/**
 * Resolve os entitlements de um grupo a partir do plano ativo.
 * Prioriza BillingPlan (novo) sobre SubscriptionPlan (legado).
 */
export async function getGroupEntitlements(groupId: string): Promise<Entitlements> {
  if (!groupId) return NO_SUBSCRIPTION_ENTITLEMENTS;

  const subscription = await (prisma as any).subscription.findUnique({
    where: { groupId },
    include: {
      plan: true,
      billingPlan: true,
    },
  });

  if (!subscription) return NO_SUBSCRIPTION_ENTITLEMENTS;

  const isActive = ["ACTIVE", "TRIALING"].includes(subscription.status);
  if (!isActive) return { ...NO_SUBSCRIPTION_ENTITLEMENTS, isActive: false };

  // Priorizar BillingPlan (fase 2+) sobre SubscriptionPlan legado
  if (subscription.billingPlan) {
    return resolveFromBillingPlan(subscription.billingPlan, isActive);
  }

  return resolveFromLegacyPlan(subscription.plan, isActive);
}

function resolveFromBillingPlan(plan: any, isActive: boolean): Entitlements {
  const f = plan.features ?? {};
  const multitracks = Number(f.multitracks ?? 0);
  const splits = Number(f.splits ?? 0);

  return {
    canAccessMultitracks: multitracks > 0,
    canAccessProfessor: Boolean(f.professor),
    canAccessSplits: splits > 0,
    canUploadAudio: Boolean(f.audio_upload),
    canAccessPads: true,
    multitracksPerMonth: multitracks,
    splitsPerMonth: splits,
    membersLimit: plan.userLimit ?? 0,
    planName: plan.name,
    planSlug: plan.slug,
    isActive,
    isFree: plan.price === 0,
  };
}

function resolveFromLegacyPlan(plan: any, isActive: boolean): Entitlements {
  if (!plan) return NO_SUBSCRIPTION_ENTITLEMENTS;

  // Plano legado usa features como array de strings: ["multitracks:3", "professor:true"]
  const features: string[] = plan.features ?? [];

  const getNum = (key: string) => {
    const match = features.find((f: string) => f.startsWith(`${key}:`));
    return match ? Number(match.split(":")[1]) : 0;
  };
  const getBool = (key: string) => {
    const match = features.find((f: string) => f.startsWith(`${key}:`));
    return match ? match.split(":")[1] === "true" : false;
  };

  const multitracks = getNum("multitracks");
  const splits = getNum("splits");

  return {
    canAccessMultitracks: multitracks > 0,
    canAccessProfessor: getBool("professor"),
    canAccessSplits: splits > 0,
    canUploadAudio: true,
    canAccessPads: true,
    multitracksPerMonth: multitracks,
    splitsPerMonth: splits,
    membersLimit: plan.userLimit ?? 0,
    planName: plan.name,
    planSlug: null,
    isActive,
    isFree: plan.price === 0,
  };
}

/**
 * Verifica se um grupo pode acessar uma feature específica.
 * Uso: await canAccessFeature(groupId, "multitracks")
 */
export async function canAccessFeature(
  groupId: string,
  feature: FeatureKey
): Promise<boolean> {
  const ent = await getGroupEntitlements(groupId);

  switch (feature) {
    case "multitracks":   return ent.canAccessMultitracks;
    case "professor":     return ent.canAccessProfessor;
    case "splits":        return ent.canAccessSplits;
    case "audio_upload":  return ent.canUploadAudio;
    case "pads":          return ent.canAccessPads;
    case "members":       return true; // sempre tem acesso, mas com limite
    default:              return false;
  }
}

/**
 * Retorna a quota de uma feature para um grupo.
 * Uso: await getQuota(groupId, "multitracks") → 3
 */
export async function getQuota(
  groupId: string,
  feature: FeatureKey
): Promise<number> {
  const ent = await getGroupEntitlements(groupId);

  switch (feature) {
    case "multitracks": return ent.multitracksPerMonth;
    case "splits":      return ent.splitsPerMonth;
    case "members":     return ent.membersLimit;
    default:            return 0;
  }
}

/**
 * Versão leve para uso no frontend via API.
 * Retorna apenas os entitlements relevantes para o cliente.
 */
export function serializeEntitlements(ent: Entitlements) {
  return {
    plan: { name: ent.planName, slug: ent.planSlug, isActive: ent.isActive, isFree: ent.isFree },
    features: {
      multitracks: ent.canAccessMultitracks,
      professor: ent.canAccessProfessor,
      splits: ent.canAccessSplits,
      audioUpload: ent.canUploadAudio,
      pads: ent.canAccessPads,
    },
    quotas: {
      multitracksPerMonth: ent.multitracksPerMonth,
      splitsPerMonth: ent.splitsPerMonth,
      membersLimit: ent.membersLimit,
    },
  };
}
