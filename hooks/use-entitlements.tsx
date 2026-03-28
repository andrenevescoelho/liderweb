"use client";

import { useEffect, useState } from "react";

export interface EntitlementsData {
  plan: {
    name: string;
    slug: string | null;
    isActive: boolean;
    isFree: boolean;
  };
  features: {
    multitracks: boolean;
    professor: boolean;
    splits: boolean;
    audioUpload: boolean;
    pads: boolean;
  };
  quotas: {
    multitracksPerMonth: number;
    splitsPerMonth: number;
    membersLimit: number;
  };
}

const DEFAULT_ENTITLEMENTS: EntitlementsData = {
  plan: { name: "Carregando...", slug: null, isActive: false, isFree: true },
  features: { multitracks: false, professor: false, splits: false, audioUpload: false, pads: false },
  quotas: { multitracksPerMonth: 0, splitsPerMonth: 0, membersLimit: 0 },
};

/**
 * Hook para acessar os entitlements do grupo logado.
 *
 * Uso:
 * const { entitlements, loading } = useEntitlements();
 * if (!entitlements.features.multitracks) return <UpgradeOverlay />;
 */
export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<EntitlementsData>(DEFAULT_ENTITLEMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/entitlements")
      .then((r) => r.json())
      .then(setEntitlements)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { entitlements, loading };
}

/**
 * Componente de overlay de upgrade — exibir quando feature não disponível.
 *
 * Uso:
 * <UpgradeOverlay feature="multitracks" requiredPlan="Intermediário" />
 */
export function UpgradeOverlay({
  feature,
  requiredPlan,
  children,
}: {
  feature: keyof EntitlementsData["features"];
  requiredPlan?: string;
  children?: React.ReactNode;
}) {
  const { entitlements, loading } = useEntitlements();

  if (loading) return <>{children}</>;
  if (entitlements.features[feature]) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-40 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm border border-border/60 z-10 p-6 text-center">
        <div className="text-2xl mb-2">🔒</div>
        <p className="font-semibold text-sm mb-1">Recurso Premium</p>
        {requiredPlan && (
          <p className="text-xs text-muted-foreground mb-3">
            Disponível a partir do plano <strong>{requiredPlan}</strong>
          </p>
        )}
        <a
          href="/planos"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Ver planos
        </a>
      </div>
    </div>
  );
}

/**
 * Componente de badge de quota — exibir uso atual vs limite.
 *
 * Uso:
 * <QuotaBadge quota="multitracksPerMonth" used={2} label="Multitracks" />
 */
export function QuotaBadge({
  quota,
  used,
  label,
}: {
  quota: keyof EntitlementsData["quotas"];
  used: number;
  label: string;
}) {
  const { entitlements, loading } = useEntitlements();
  if (loading) return null;

  const limit = entitlements.quotas[quota];
  if (limit === 0) return null;

  const isNearLimit = used >= limit * 0.8;
  const isAtLimit = used >= limit;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
        isAtLimit
          ? "bg-red-500/15 text-red-600"
          : isNearLimit
          ? "bg-amber-500/15 text-amber-600"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {label}: {used}/{limit}
    </span>
  );
}
