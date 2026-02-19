"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Music, Users, Calendar, Headphones, Star } from "lucide-react";
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
    isFree: true,
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
    price: 29.90,
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
    price: 49.90,
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
    price: 99.90,
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
    price: 149.90,
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

export default function PlanosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    setLoading(planId);
    try {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.needsGroup) {
        // Redirecionar para criar grupo primeiro
        router.push(`/signup?plan=${planId}`);
      } else {
        alert(data.error || "Erro ao processar. Tente novamente.");
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao processar. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-8 h-8 text-white" />
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-white">Líder Web</span>
              <span className="text-xs text-purple-300">By Multitrack Gospel</span>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push("/login")}
          >
            Entrar
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Gerencie seu Ministério de Louvor
        </h1>
        <p className="text-xl text-purple-200 mb-8 max-w-2xl mx-auto">
          Escalas, repertórios, cifras e muito mais. Tudo em um só lugar para sua equipe de louvor.
        </p>

        {/* Features */}
        <div className="flex flex-wrap justify-center gap-6 mb-12">
          <div className="flex items-center gap-2 text-white">
            <Users className="w-5 h-5 text-purple-300" />
            <span>Gestão de Equipe</span>
          </div>
          <div className="flex items-center gap-2 text-white">
            <Music className="w-5 h-5 text-purple-300" />
            <span>Cifras com Transposição</span>
          </div>
          <div className="flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5 text-purple-300" />
            <span>Escalas Automatizadas</span>
          </div>
          <div className="flex items-center gap-2 text-white">
            <Headphones className="w-5 h-5 text-purple-300" />
            <span>Upload de Áudio</span>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 pb-20">
        <h2 className="text-3xl font-bold text-white text-center mb-4">
          Escolha seu Plano
        </h2>
        <p className="text-purple-200 text-center mb-10">
          7 dias de teste grátis em todos os planos. Cancele quando quiser.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative overflow-hidden transition-transform hover:scale-105 ${
                plan.popular
                  ? "border-2 border-yellow-400 shadow-xl shadow-yellow-400/20"
                  : "border-purple-700"
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-lg bg-yellow-400 text-yellow-900 font-semibold">
                    <Star className="w-3 h-3 mr-1" /> Mais Popular
                  </Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
                  {plan.name}
                </CardTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  {(plan as any).isFree ? (
                    <span className="text-4xl font-bold text-green-600">
                      Grátis
                    </span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-purple-600">
                        R${plan.price.toFixed(2).replace(".", ",")}
                      </span>
                      <span className="text-gray-500">/mês</span>
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-6 text-left">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${
                    plan.popular
                      ? "bg-yellow-400 hover:bg-yellow-500 text-yellow-900"
                      : (plan as any).isFree
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : ""
                  }`}
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loading !== null}
                >
                  {loading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (plan as any).isFree ? (
                    "Começar Grátis"
                  ) : (
                    "Começar Teste Grátis"
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-purple-300 mt-8 text-sm">
          Todos os planos incluem 7 dias de teste grátis. Você só será cobrado após o período de teste.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-purple-700 py-8">
        <div className="container mx-auto px-4 text-center text-purple-300">
          <p>© 2025 Líder Web by Multitrack Gospel. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
