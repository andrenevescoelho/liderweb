"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Check, Crown, CreditCard, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    description: "Para conhecer a plataforma",
    price: 0,
    userLimit: 10,
    features: [
      "Até 10 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Suporte por email",
    ],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Ideal para ministérios pequenos",
    price: 29.9,
    userLimit: 15,
    features: [
      "Até 15 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte por email",
    ],
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "Para ministérios em crescimento",
    price: 49.9,
    userLimit: 30,
    popular: true,
    features: [
      "Até 30 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte prioritário",
    ],
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Para grandes ministérios",
    price: 99.9,
    userLimit: 100,
    features: [
      "Até 100 usuários",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte VIP",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para igrejas com múltiplos ministérios",
    price: 149.9,
    userLimit: 0,
    features: [
      "Usuários ilimitados",
      "Músicas ilimitadas",
      "Repertórios ilimitados",
      "Escalas ilimitadas",
      "Upload de áudio",
      "Suporte dedicado",
      "Onboarding personalizado",
    ],
  },
];

function formatBRL(value: number) {
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

function formatPlanPrice(value: number) {
  if (value === 0) return "Grátis";
  return formatBRL(value);
}

export default function MeuPlanoPage() {
  const router = useRouter();
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role ?? "MEMBER";

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const canManage = useMemo(() => ["ADMIN", "SUPERADMIN"].includes(userRole), [userRole]);

  useEffect(() => {
    if (!session) return;

    if (!canManage) {
      // Leva o usuário de volta para evitar confusão
      router.replace("/dashboard");
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/subscription/status");
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error(e);
        setStatus({ error: "Erro ao carregar status da assinatura" });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [session, canManage, router]);

  const currentPlanName = status?.subscription?.planName ?? null;
  const canUseStripePortal = !!status?.subscription?.hasStripeCustomer;

  const handleOpenPortal = async () => {
    if (!canUseStripePortal) {
      alert("Esta assinatura não está vinculada ao Stripe. Escolha um plano para migrar.");
      return;
    }

    setPortalLoading(true);
    try {
      const res = await fetch("/api/subscription/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Não foi possível abrir o portal do Stripe.");
    } catch (e) {
      console.error(e);
      alert("Erro ao abrir o portal do Stripe.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    setActionLoading(planId);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else if (data.needsGroup) router.push(`/signup?plan=${planId}`);
      else alert(data.error || "Erro ao processar. Tente novamente.");
    } catch (e) {
      console.error(e);
      alert("Erro ao processar. Tente novamente.");
    } finally {
      setActionLoading(null);
    }
  };

  if (!canManage) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Acesso restrito
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Apenas administradores do grupo podem gerenciar o plano.
          </p>
          <div className="mt-4">
            <Button onClick={() => router.push("/dashboard")}>Voltar</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Meu Plano</h1>
          <p className="text-sm text-muted-foreground">
            Veja seu plano atual e faça upgrade ou downgrade.
          </p>
        </div>

        <Button onClick={handleOpenPortal} disabled={portalLoading || loading || !canUseStripePortal}>
          {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
          Gerenciar no Stripe
          <ExternalLink className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      ) : status?.error ? (
        <Card className="border-red-200">
          <CardContent className="p-4 text-sm">
            {status.error}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-purple-600" />
            Situação da assinatura
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {status?.hasSubscription ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  Plano atual: <strong>{status?.subscription?.planName}</strong>
                </span>
                {status?.isActive ? (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativa</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Inativa</Badge>
                )}
                {status?.subscription?.cancelAtPeriodEnd ? (
                  <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Cancelamento agendado</Badge>
                ) : null}
              </div>

              <div className="text-muted-foreground">
                Usuários: {status?.subscription?.userCount} /{" "}
                {status?.subscription?.userLimit === 0 ? "ilimitado" : status?.subscription?.userLimit}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">
              Seu grupo ainda não possui uma assinatura.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = !!currentPlanName && plan.name === currentPlanName;

          return (
            <Card
              key={plan.id}
              className={[
                "relative transition-all",
                isCurrent ? "border-purple-500 shadow-md" : "hover:shadow-md",
              ].join(" ")}
            >
              {plan.popular && !isCurrent && (
                <Badge className="absolute top-3 right-3 bg-purple-600 text-white hover:bg-purple-600">
                  Popular
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute top-3 right-3 bg-purple-100 text-purple-800 hover:bg-purple-100">
                  Plano atual
                </Badge>
              )}

              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isCurrent ? <Crown className="w-5 h-5 text-purple-600" /> : null}
                  {plan.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="text-3xl font-bold">
                  {formatPlanPrice(plan.price)}
                  {plan.price > 0 ? (
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  ) : null}
                </div>

                <div className="space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 mt-0.5 text-green-600" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  variant={status?.hasSubscription && isCurrent ? "secondary" : "default"}
                  disabled={!!actionLoading || (status?.hasSubscription && canUseStripePortal && portalLoading)}
                  onClick={() => {
                    if (isCurrent) {
                      alert("Você já tem essa assinatura.");
                      return;
                    }

                    if (status?.hasSubscription && canUseStripePortal) {
                      handleOpenPortal();
                      return;
                    }

                    handleSubscribe(plan.id);
                  }}
                >
                  {actionLoading === plan.id || (status?.hasSubscription && canUseStripePortal && portalLoading) ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Crown className="w-4 h-4 mr-2" />
                  )}
                  {status?.hasSubscription && canUseStripePortal ? "Upgrade/Downgrade (Stripe)" : "Assinar este plano"}
                </Button>

                {status?.hasSubscription && !isCurrent && canUseStripePortal ? (
                  <p className="text-xs text-muted-foreground">
                    Você será redirecionado ao portal do Stripe para alterar o plano.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
