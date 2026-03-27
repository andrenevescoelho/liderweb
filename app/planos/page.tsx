"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, X, Loader2, Disc3, Brain, Users, Scissors, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    tagline: "Para conhecer a plataforma",
    price: 0,
    isFree: true,
    members: 10,
    color: "#64748B",
    features: {
      gestao: true,
      professor: false,
      multitracks: 0,
      split: 0,
    },
  },
  {
    id: "basico",
    name: "Básico",
    tagline: "Para ministérios que querem crescer",
    price: 29.90,
    members: 15,
    color: "#14B8A6",
    features: {
      gestao: true,
      professor: true,
      multitracks: 0,
      split: 0,
    },
  },
  {
    id: "intermediario",
    name: "Intermediário",
    tagline: "Para ministérios em crescimento",
    price: 49.90,
    members: 30,
    popular: true,
    color: "#14B8A6",
    features: {
      gestao: true,
      professor: true,
      multitracks: 3,
      split: 0,
    },
  },
  {
    id: "avancado",
    name: "Avançado",
    tagline: "Para grandes ministérios",
    price: 99.90,
    members: 100,
    color: "#8B5CF6",
    features: {
      gestao: true,
      professor: true,
      multitracks: 5,
      split: 3,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Para igrejas com múltiplos ministérios",
    price: 149.90,
    members: 0,
    color: "#8B5CF6",
    features: {
      gestao: true,
      professor: true,
      multitracks: 10,
      split: 10,
    },
  },
];

const EXTRAS = [
  {
    icon: <Disc3 className="h-5 w-5" />,
    title: "Multitrack Adicional",
    description: "Aluguel extra além da cota mensal do plano.",
    price: "R$ 9,90",
    unit: "por track",
    color: "#14B8A6",
  },
  {
    icon: <Scissors className="h-5 w-5" />,
    title: "Split Adicional",
    description: "Solicite um split extra. Fica no acervo para reutilização.",
    price: "R$ 19,90",
    unit: "por split",
    color: "#8B5CF6",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Split do Acervo",
    description: "Acesse um split já processado por outro ministério.",
    price: "R$ 4,90",
    unit: "por acesso",
    color: "#F59E0B",
  },
];

export default function PlanosPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelect = async (plan: typeof PLANS[0]) => {
    setLoading(plan.id);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();

      if (data.needsGroup) {
        // Usuário não logado — redirecionar para signup
        router.push(`/signup?plan=${plan.id}`);
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

      if (data.error) {
        setErrorMsg(data.error);
        return;
      }

      setErrorMsg("Não foi possível iniciar o checkout. Tente novamente.");
    } catch (err) {
      setErrorMsg("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(null);
    }
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
        <Button variant="outline" size="sm" onClick={() => router.push(session ? "/reativar-assinatura" : "/login")}>
          {session ? "Minha Conta" : "Entrar"}
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

        {/* Banner de erro */}
        {errorMsg && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-center text-sm text-red-400">
            {errorMsg}
            {errorMsg.includes("administrador") && (
              <div className="mt-2">
                <button onClick={() => router.push("/login")} className="underline text-red-300 hover:text-red-200">
                  Entrar com outra conta
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-16">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "relative rounded-2xl border p-5 flex flex-col",
                plan.popular
                  ? "border-teal-500 bg-teal-500/5"
                  : plan.id === "avancado" || plan.id === "igreja"
                  ? "border-violet-500/40 bg-violet-500/5"
                  : "border-white/8 bg-white/3"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-500 px-3 py-0.5 text-[10px] font-bold text-teal-950 whitespace-nowrap">
                  ⭐ Mais Popular
                </div>
              )}

              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{plan.name}</p>
                <p className="text-[11px] text-slate-500 min-h-[32px] leading-tight">{plan.tagline}</p>
              </div>

              <div className="mb-5">
                {plan.isFree ? (
                  <span className="text-3xl font-bold text-teal-400">Grátis</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-white">
                      R$ {Math.floor(plan.price)}<span className="text-lg">,{String(plan.price.toFixed(2)).split(".")[1]}</span>
                    </span>
                    <span className="text-xs text-slate-500 block mt-0.5">/mês</span>
                  </>
                )}
              </div>

              <Button
                size="sm"
                className={cn(
                  "w-full mb-5 text-xs",
                  plan.popular ? "bg-teal-500 hover:bg-teal-600 text-teal-950" :
                  plan.id === "avancado" || plan.id === "igreja" ? "bg-violet-600 hover:bg-violet-700 text-white" :
                  plan.isFree ? "bg-white/10 hover:bg-white/15 text-white" : "bg-white/10 hover:bg-white/15 text-white"
                )}
                onClick={() => handleSelect(plan)}
                disabled={loading === plan.id}
              >
                {loading === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                  plan.isFree ? "Começar Grátis" : "Começar Teste Grátis"}
              </Button>

              <div className="h-px bg-white/8 mb-4" />

              {/* Features */}
              <div className="space-y-2.5 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-2">Gestão</p>
                <FeatureRow ok label={plan.members === 0 ? "Membros ilimitados" : `Até ${plan.members} membros`} highlight />
                <FeatureRow ok label="Músicas e cifras" />
                <FeatureRow ok label="Escalas ilimitadas" />
                <FeatureRow ok label="Ensaios" />
                <FeatureRow ok label="Chat do grupo" />

                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mt-3 mb-2">Módulos Premium</p>
                <FeatureRow ok={plan.features.professor} label="Professor IA" tag={plan.features.professor ? "IA" : undefined} />
                <FeatureRow
                  ok={plan.features.multitracks > 0}
                  label={plan.features.multitracks > 0 ? `${plan.features.multitracks} Multitracks/mês` : "Multitracks"}
                  tag={plan.features.multitracks > 0 ? "NOVO" : undefined}
                />
                <FeatureRow
                  ok={plan.features.split > 0}
                  label={plan.features.split > 0 ? `${plan.features.split} Splits/mês` : "Split de músicas"}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Extras */}
        <div className="rounded-2xl border border-white/8 bg-white/2 p-8 mb-12">
          <h2 className="text-lg font-bold text-white mb-2">Recursos Adicionais</h2>
          <p className="text-sm text-slate-500 mb-6">Precisou de mais? Contrate avulso sem precisar mudar de plano.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {EXTRAS.map((extra, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-[#0a0f1e] p-5">
                <div className="flex items-center gap-2 mb-3" style={{ color: extra.color }}>
                  {extra.icon}
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

        {/* Split info */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-8">
          <div className="flex items-start gap-5">
            <div className="text-3xl flex-shrink-0">✂️</div>
            <div>
              <h3 className="text-base font-bold text-white mb-2">Como funciona o Split Compartilhado?</h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                Quando um ministério solicita o split de uma música, o arquivo processado fica no acervo LiderWeb.
                Outro ministério que quiser a mesma música paga um valor menor para acessar o split já pronto.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { num: "①", title: "Ministério A", desc: "Solicita split da música X e paga R$ 19,90" },
                  { num: "②", title: "Acervo LiderWeb", desc: "Split processado e armazenado com segurança" },
                  { num: "③", title: "Ministério B", desc: "Acessa o mesmo split por R$ 4,90" },
                ].map((step, i) => (
                  <div key={i} className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wide mb-1">{step.num} {step.title}</p>
                    <p className="text-xs text-slate-400">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-10">
          © {new Date().getFullYear()} Líder Web by Multitrack Gospel. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

function FeatureRow({ ok, label, highlight, tag }: { ok: boolean; label: string; highlight?: boolean; tag?: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <Check className="h-3.5 w-3.5 text-teal-400 flex-shrink-0" />
      ) : (
        <X className="h-3.5 w-3.5 text-slate-700 flex-shrink-0" />
      )}
      <span className={cn("text-[11px] leading-tight", ok ? highlight ? "text-white font-medium" : "text-slate-300" : "text-slate-600")}>
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
