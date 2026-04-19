"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, X, Loader2, Headphones, Brain, Scissors, Zap, Users, Grid3x3, BarChart2, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BillingPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tagline: string | null;
  price: number;
  period: string;
  trialDays: number;
  isPopular: boolean;
  badge: string | null;
  sortOrder: number;
  userLimit: number;
  features: Record<string, any>;
  gatewayMappings: { gateway: string; externalId: string }[];
}

const FEATURE_LABELS: Record<string, { label: string; icon: any }> = {
  professor:   { label: "Professor IA", icon: Brain },
  multitracks: { label: "Multitracks/mês", icon: Headphones },
  splits:      { label: "Splits/mês", icon: Scissors },
  audio_upload:{ label: "Upload de áudio", icon: Zap },
};

const EXTRAS = [
  { icon: Headphones, title: "Multitrack Adicional", description: "Aluguel extra além da cota mensal.", price: "R$ 9,90", unit: "por track", color: "#14B8A6" },
  { icon: Scissors, title: "Split Adicional", description: "Solicite um split extra.", price: "R$ 9,90", unit: "por split", color: "#8B5CF6" },
  { icon: Zap, title: "Split do Acervo", description: "Acesse um split já processado.", price: "R$ 4,90", unit: "por acesso", color: "#F59E0B" },
  { icon: Sliders, title: "Custom Mix Adicional", description: "Crie um mix extra além da sua cota mensal.", price: "R$ 9,90", unit: "por mix", color: "#A78BFA" },
];

export default function PlanosPage() {
  // Liberar scroll desta página (html/body têm overflow:hidden no app)
  useEffect(() => {
    document.documentElement.classList.add("page-scrollable");
    return () => document.documentElement.classList.remove("page-scrollable");
  }, []);

  const router = useRouter();
  const { data: session } = useSession();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAccountClick = async () => {
    if (!session) { router.push("/login"); return; }
    setCheckingAccount(true);
    try {
      const res = await fetch("/api/subscription/status");
      const data = await res.json();
      const isActive = data.hasSubscription && data.isActive;
      router.push(isActive ? "/dashboard" : "/reativar-assinatura");
    } catch {
      router.push("/dashboard");
    } finally {
      setCheckingAccount(false);
    }
  };

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((data) => setPlans(data.plans ?? []))
      .catch(() => setErrorMsg("Erro ao carregar planos"))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (plan: BillingPlan) => {
    setSubmitting(plan.slug);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: plan.slug }),
      });
      const data = await res.json();

      if (data.needsAccount) {
        router.push(`/signup?plan=${plan.slug}`);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (res.status === 403) {
        setErrorMsg("Apenas administradores do grupo podem gerenciar assinaturas.");
        return;
      }
      setErrorMsg(data.error || "Não foi possível iniciar o checkout. Tente novamente.");
    } catch {
      setErrorMsg("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(null);
    }
  };

  const formatPrice = (price: number) => {
    if (price === 0) return null;
    const [int, dec] = price.toFixed(2).split(".");
    return { int, dec };
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-200">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="Líder Web" className="h-8 w-8" />
          <span className="font-bold text-white">Líder Web</span>
          <span className="text-xs text-slate-500">by multitrackgospel.com</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAccountClick}
          disabled={checkingAccount}
        >
          {checkingAccount
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : session ? "Minha Conta" : "Entrar"}
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-white mb-4">Escolha seu Plano</h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Ferramentas completas para gestão e desenvolvimento musical do seu ministério de louvor.
          </p>
          <div className="inline-flex items-center gap-2 mt-5 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm text-teal-400">
            ✦ 7 dias de teste grátis em todos os planos pagos
          </div>
        </div>

        {/* Erro */}
        {errorMsg && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {/* Plans */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-16">
            {plans.map((plan) => {
              const isFree = plan.price === 0;
              const price = formatPrice(plan.price);
              const isViolet = plan.slug === "avancado" || plan.slug === "enterprise";
              const hasStripe = plan.gatewayMappings.some((m) => m.gateway === "STRIPE");

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "relative rounded-2xl border p-5 flex flex-col",
                    plan.isPopular
                      ? "border-teal-500 bg-teal-500/5"
                      : isViolet
                      ? "border-violet-500/40 bg-violet-500/5"
                      : "border-white/8 bg-white/3"
                  )}
                >
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-500 px-3 py-0.5 text-[10px] font-bold text-teal-950 whitespace-nowrap">
                      ⭐ {plan.badge}
                    </div>
                  )}

                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{plan.name}</p>
                    <p className="text-[11px] text-slate-500 min-h-[32px] leading-tight">{plan.tagline}</p>
                  </div>

                  <div className="mb-5">
                    {isFree ? (
                      <span className="text-3xl font-bold text-teal-400">Grátis</span>
                    ) : price ? (
                      <>
                        <span className="text-3xl font-bold text-white">
                          R$ {price.int}<span className="text-lg">,{price.dec}</span>
                        </span>
                        <span className="text-xs text-slate-500 block mt-0.5">/mês</span>
                      </>
                    ) : null}
                  </div>

                  <Button
                    size="sm"
                    className={cn(
                      "w-full mb-5 text-xs",
                      plan.isPopular ? "bg-teal-500 hover:bg-teal-600 text-teal-950" :
                      isViolet ? "bg-violet-600 hover:bg-violet-700 text-white" :
                      "bg-white/10 hover:bg-white/15 text-white"
                    )}
                    onClick={() => handleSelect(plan)}
                    disabled={submitting === plan.slug || (!isFree && !hasStripe)}
                  >
                    {submitting === plan.slug
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : isFree ? "Começar Grátis" : "Começar Teste Grátis"}
                  </Button>

                  <div className="h-px bg-white/8 mb-4" />

                  {/* Features */}
                  <div className="space-y-2.5 flex-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Gestão</p>
                    <FeatureRow ok label={plan.userLimit === 0 ? "Membros ilimitados" : `Até ${plan.userLimit} membros`} highlight />
                    <FeatureRow ok label="Músicas e cifras" />
                    <FeatureRow ok label="Escalas ilimitadas" />
                    <FeatureRow ok label="Ensaios" />
                    <FeatureRow ok label="Chat do grupo" />

                    <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mt-3 mb-2">Módulos Premium</p>
                    <FeatureRow
                      ok={Boolean(plan.features.professor)}
                      label="Professor IA"
                      tag={plan.features.professor ? "IA" : undefined}
                    />
                    <FeatureRow
                      ok={Number(plan.features.multitracks) > 0}
                      label={Number(plan.features.multitracks) > 0
                        ? `${plan.features.multitracks} Multitracks/mês`
                        : "Multitracks"}
                      tag={Number(plan.features.multitracks) > 0 ? "NOVO" : undefined}
                    />
                    <FeatureRow
                      ok={Number(plan.features.splits) > 0}
                      label={Number(plan.features.splits) > 0
                        ? `${plan.features.splits} Splits/mês`
                        : "Split de músicas"}
                    />
                    <FeatureRow
                      ok={Number(plan.features["custom-mix"]) > 0}
                      label={Number(plan.features["custom-mix"]) > 0
                        ? `${plan.features["custom-mix"]} Custom Mix/mês`
                        : "Custom Mix"}
                      tag={Number(plan.features["custom-mix"]) > 0 ? "NOVO" : undefined}
                    />
                    <FeatureRow
                      ok={plan.slug !== "free" && plan.slug !== "gratuito"}
                      label="Pads & Loops"
                    />
                    <FeatureRow
                      ok={plan.slug !== "free" && plan.slug !== "gratuito"}
                      label="Métricas do ministério"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Extras */}
        <div className="rounded-2xl border border-white/8 bg-white/2 p-8 mb-12">
          <h2 className="text-lg font-bold text-white mb-2">Recursos Adicionais</h2>
          <p className="text-sm text-slate-500 mb-6">Precisou de mais? Contrate avulso sem precisar mudar de plano.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {EXTRAS.map((extra, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-[#0a0f1e] p-5">
                <div className="flex items-center gap-2 mb-3" style={{ color: extra.color }}>
                  <extra.icon className="h-5 w-5" />
                  <h3 className="text-sm font-semibold text-white">{extra.title}</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">{extra.description}</p>
                <div className="text-xl font-bold" style={{ color: extra.color }}>
                  {extra.price} <span className="text-xs text-slate-500 font-normal">{extra.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-10">
          © {new Date().getFullYear()} Líder Web by Multitrack Gospel. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

function FeatureRow({ ok, label, highlight, tag }: {
  ok: boolean; label: string; highlight?: boolean; tag?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <Check className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
        : <X className="h-3.5 w-3.5 text-slate-700 flex-shrink-0" />
      }
      <span className={cn(
        "text-[11px] leading-tight",
        ok ? highlight ? "text-white font-medium" : "text-slate-300" : "text-slate-600"
      )}>
        {label}
      </span>
      {tag && (
        <span className={cn(
          "text-[9px] font-bold px-1 py-0.5 rounded",
          tag === "IA" ? "bg-violet-500/20 text-violet-400" : "bg-teal-500/20 text-teal-400"
        )}>{tag}</span>
      )}
    </div>
  );
}