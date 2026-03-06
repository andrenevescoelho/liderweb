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
    isFree: true,
    features: ["Até 10 usuários", "Músicas ilimitadas", "Repertórios ilimitados", "Escalas ilimitadas", "Suporte por email"],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Ideal para ministérios pequenos",
    price: 29.9,
    features: ["Até 15 usuários", "Músicas ilimitadas", "Repertórios ilimitados", "Escalas ilimitadas", "Upload de áudio", "Suporte por email"],
  },
  {
    id: "intermediario",
    name: "Intermediário",
    description: "Para ministérios em crescimento",
    price: 49.9,
    popular: true,
    features: ["Até 30 usuários", "Músicas ilimitadas", "Repertórios ilimitados", "Escalas ilimitadas", "Upload de áudio", "Suporte prioritário"],
  },
  {
    id: "avancado",
    name: "Avançado",
    description: "Para grandes ministérios",
    price: 99.9,
    features: ["Até 100 usuários", "Músicas ilimitadas", "Repertórios ilimitados", "Escalas ilimitadas", "Upload de áudio", "Suporte VIP"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para igrejas com múltiplos ministérios",
    price: 149.9,
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.2),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_40%)]" />

      <header className="relative border-b border-border/70">
        <div className="container mx-auto flex items-center justify-between px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/25 bg-primary/15 p-2.5">
              <Music className="h-6 w-6 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-semibold">LiderWeb</span>
              <span className="text-xs text-muted-foreground">By Multitrack Gospel</span>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push("/login")}>
            Entrar
          </Button>
        </div>
      </header>

      <main className="relative">
        <section className="container mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Gerencie seu Ministério de Louvor</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Escalas, repertórios, cifras e muito mais. Tudo em um só lugar para sua equipe de louvor.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Gestão de Equipe</span>
            </div>
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-primary" />
              <span>Cifras com Transposição</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>Escalas Automatizadas</span>
            </div>
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-primary" />
              <span>Upload de Áudio</span>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 pb-20">
          <h2 className="text-center text-3xl font-semibold">Escolha seu Plano</h2>
          <p className="mt-3 text-center text-muted-foreground">7 dias de teste grátis em todos os planos. Cancele quando quiser.</p>

          <div className="mx-auto mt-10 grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex h-full flex-col overflow-hidden transition hover:-translate-y-1 ${
                  plan.popular ? "border-primary shadow-lg shadow-primary/20" : "border-border/70"
                }`}
              >
                {plan.popular && (
                  <div className="absolute right-0 top-0">
                    <Badge className="rounded-none rounded-bl-lg bg-primary text-primary-foreground">
                      <Star className="mr-1 h-3 w-3" /> Mais Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-2 text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <div className="mb-6 text-center">
                    {plan.isFree ? (
                      <span className="text-4xl font-bold text-emerald-500">Grátis</span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold">R${plan.price.toFixed(2).replace(".", ",")}</span>
                        <span className="text-muted-foreground">/mês</span>
                      </>
                    )}
                  </div>

                  <ul className="mb-6 space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="mt-auto w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading !== null}
                  >
                    {loading === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : plan.isFree ? "Começar Grátis" : "Começar Teste Grátis"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Todos os planos incluem 7 dias de teste grátis. Você só será cobrado após o período de teste.
          </p>
        </section>
      </main>

      <footer className="relative border-t border-border/70 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Líder Web by Multitrack Gospel. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
