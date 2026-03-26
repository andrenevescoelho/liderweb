"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Check, X, Crown, CreditCard, ExternalLink, Loader2, AlertCircle, Ticket, Disc3, Brain, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    tagline: "Para conhecer a plataforma",
    price: 0,
    isFree: true,
    members: 10,
    popular: false,
    color: "slate",
    features: { gestao: true, professor: false, multitracks: 0, split: 0 },
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "Para ministérios que querem crescer",
    price: 29.90,
    members: 15,
    popular: false,
    color: "teal",
    features: { gestao: true, professor: true, multitracks: 0, split: 0 },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para ministérios em crescimento",
    price: 69.90,
    members: 25,
    popular: true,
    color: "teal",
    features: { gestao: true, professor: true, multitracks: 3, split: 0 },
  },
  {
    id: "avancado",
    name: "Avançado",
    tagline: "Para grandes ministérios",
    price: 119.90,
    members: 40,
    popular: false,
    color: "violet",
    features: { gestao: true, professor: true, multitracks: 5, split: 3 },
  },
  {
    id: "igreja",
    name: "Igreja",
    tagline: "Para igrejas com múltiplos ministérios",
    price: 199.90,
    members: 80,
    popular: false,
    color: "violet",
    features: { gestao: true, professor: true, multitracks: 10, split: 10 },
  },
];

function formatBRL(value: number) {
  try { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  catch { return `R$ ${value.toFixed(2)}`; }
}

function FeatureRow({ ok, label, tag }: { ok: boolean; label: string; tag?: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" /> : <X className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0" />}
      <span className={cn("text-xs", ok ? "text-foreground" : "text-muted-foreground/50")}>{label}</span>
      {tag && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-primary/10 text-primary">{tag}</span>}
    </div>
  );
}

export default function MeuPlanoPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";
  const userPermissions = ((session?.user as any)?.permissions ?? []) as string[];

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  const canManage = useMemo(() =>
    ["ADMIN", "SUPERADMIN"].includes(userRole) || userPermissions.includes("subscription.manage"),
    [userPermissions, userRole]
  );

  useEffect(() => {
    if (!session) return;
    if (!canManage) { router.replace("/dashboard"); return; }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/subscription/status");
        setStatus(await res.json());
      } catch { setStatus({ error: "Erro ao carregar status da assinatura" }); }
      finally { setLoading(false); }
    };
    load();
  }, [session, canManage, router]);

  const currentPlanName = status?.subscription?.planName ?? null;
  const canUseStripePortal = !!status?.subscription?.hasStripeCustomer;

  const handleOpenPortal = async () => {
    if (!canUseStripePortal) { alert("Esta assinatura não está vinculada ao Stripe. Escolha um plano para migrar."); return; }
    setPortalLoading(true);
    try {
      const res = await fetch("/api/subscription/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Não foi possível abrir o portal do Stripe.");
    } catch { alert("Erro ao abrir o portal do Stripe."); }
    finally { setPortalLoading(false); }
  };

  const handleApplyCoupon = async () => {
    setCouponFeedback(null);
    if (!couponCode.trim()) { setCouponFeedback("Informe um cupom para aplicar."); return; }
    setCouponLoading(true);
    try {
      const res = await fetch("/api/subscription/coupon/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode }),
      });
      const data = await res.json();
      if (!res.ok) { setCouponFeedback(data.error || "Não foi possível aplicar o cupom."); }
      else {
        setCouponFeedback(`Cupom aplicado com sucesso: ${data.summary}`);
        setCouponCode("");
        const statusRes = await fetch("/api/subscription/status");
        setStatus(await statusRes.json());
      }
    } catch { setCouponFeedback("Erro ao aplicar cupom."); }
    finally { setCouponLoading(false); }
  };

  const handleSubscribe = async (planId: string) => {
    setActionLoading(planId);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else if (data.needsGroup) router.push(`/signup?plan=${planId}`);
      else alert(data.error || "Erro ao processar. Tente novamente.");
    } catch { alert("Erro ao processar. Tente novamente."); }
    finally { setActionLoading(null); }
  };

  if (!canManage) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5" />Acesso restrito</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Apenas administradores do grupo podem gerenciar o plano.</p>
          <div className="mt-4"><Button onClick={() => router.push("/dashboard")}>Voltar</Button></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <Crown className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Meu Plano</h1>
              <p className="text-sm text-muted-foreground">Veja seu plano atual e faça upgrade quando precisar</p>
            </div>
          </div>
        </div>
        <Button onClick={handleOpenPortal} disabled={portalLoading || loading || !canUseStripePortal} variant="outline">
          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
          Gerenciar no Stripe
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Status atual */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Carregando...</div>
      ) : status?.error ? (
        <Card className="border-red-500/30"><CardContent className="p-4 text-sm text-red-400">{status.error}</CardContent></Card>
      ) : status?.hasSubscription ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <Crown className="w-5 h-5 text-primary" />
              <div>
                <p className="font-semibold">Plano atual: <span className="text-primary">{status.subscription?.planName}</span></p>
                <div className="flex items-center gap-2 mt-0.5">
                  {status.isActive
                    ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativa</Badge>
                    : <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Inativa</Badge>}
                  {status.subscription?.cancelAtPeriodEnd &&
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Cancelamento agendado</Badge>}
                </div>
              </div>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <span>Membros: <strong className="text-foreground">{status.subscription?.userCount} / {status.subscription?.userLimit === 0 ? "∞" : status.subscription?.userLimit}</strong></span>
              {typeof status.subscription?.originalPrice === "number" && (
                <span>Valor: <strong className="text-foreground">{formatBRL(status.subscription.effectivePrice ?? status.subscription.originalPrice)}/mês</strong></span>
              )}
            </div>
            {status.subscription?.activeCoupon && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-0.5">
                <p className="font-medium text-emerald-300">Cupom ativo: {status.subscription.activeCoupon.code}</p>
                <p className="text-emerald-400">{status.subscription.activeCoupon.benefitSummary}</p>
                {typeof status.subscription.activeCoupon.daysRemaining === "number" && (
                  <p className="text-emerald-400">
                    Dias restantes: {status.subscription.activeCoupon.daysRemaining}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-5 text-sm text-muted-foreground">Seu grupo ainda não possui uma assinatura ativa.</CardContent></Card>
      )}

      {/* Cupom */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Ticket className="w-4 h-4 text-primary" />Cupom de desconto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input placeholder="Digite o código do cupom" value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
            <Button onClick={handleApplyCoupon} disabled={couponLoading || !status?.hasSubscription}>
              {couponLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Aplicar
            </Button>
          </div>
          {couponFeedback && <p className="text-xs text-muted-foreground">{couponFeedback}</p>}
          {!status?.hasSubscription && <p className="text-xs text-muted-foreground">Você precisa de uma assinatura ativa para aplicar cupons.</p>}
        </CardContent>
      </Card>

      {/* Planos */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Planos disponíveis</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((plan) => {
            const isCurrent = !!currentPlanName && plan.name === currentPlanName;
            const isFreePlan = plan.price === 0;
            const shouldUsePortal = status?.hasSubscription && canUseStripePortal && !isFreePlan;
            const isBusy = actionLoading === plan.id || (shouldUsePortal && portalLoading);

            return (
              <div key={plan.id} className={cn(
                "relative rounded-2xl border p-5 flex flex-col transition-all",
                isCurrent ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" :
                plan.popular ? "border-primary/40 bg-primary/3" :
                plan.color === "violet" ? "border-violet-500/30 bg-violet-500/3" :
                "border-border bg-card"
              )}>
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-primary-foreground whitespace-nowrap">
                    ✓ Plano atual
                  </div>
                )}
                {plan.popular && !isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary/20 border border-primary/40 px-3 py-0.5 text-[10px] font-bold text-primary whitespace-nowrap">
                    ⭐ Popular
                  </div>
                )}

                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{plan.name}</p>
                <p className="text-[11px] text-muted-foreground mb-4 min-h-[28px] leading-tight">{plan.tagline}</p>

                <div className="mb-4">
                  {isFreePlan ? (
                    <span className="text-2xl font-bold text-primary">Grátis</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">R$ {Math.floor(plan.price)}<span className="text-base">,{String(plan.price.toFixed(2)).split(".")[1]}</span></span>
                      <span className="text-xs text-muted-foreground block">/mês</span>
                    </>
                  )}
                </div>

                <div className="space-y-2 flex-1 mb-5">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Gestão</p>
                  <FeatureRow ok label={`Até ${plan.members} membros`} />
                  <FeatureRow ok label="Músicas, escalas, ensaios" />
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50 mt-2.5 mb-1.5">Módulos</p>
                  <FeatureRow ok={plan.features.professor} label="Professor IA" tag={plan.features.professor ? "IA" : undefined} />
                  <FeatureRow ok={plan.features.multitracks > 0} label={plan.features.multitracks > 0 ? `${plan.features.multitracks} Multitracks/mês` : "Multitracks"} />
                  <FeatureRow ok={plan.features.split > 0} label={plan.features.split > 0 ? `${plan.features.split} Splits/mês` : "Split de músicas"} />
                </div>

                <Button
                  size="sm"
                  className="w-full text-xs"
                  variant={isCurrent ? "secondary" : "default"}
                  disabled={isCurrent || !!actionLoading || (shouldUsePortal && portalLoading)}
                  onClick={() => { if (shouldUsePortal) { handleOpenPortal(); return; } handleSubscribe(plan.id); }}
                >
                  {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Crown className="w-3.5 h-3.5 mr-1" />}
                  {isCurrent ? "Plano atual" : shouldUsePortal ? "Alterar plano" : isFreePlan ? "Usar grátis" : "Assinar"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
