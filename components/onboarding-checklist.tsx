"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Users, Music, Calendar, ArrowRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OnboardingStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  href: string;
  done: boolean;
}

interface Props {
  totalMembers: number;
  totalSongs: number;
  totalSetlists: number;
  groupName: string | null;
}

const STORAGE_KEY = "liderweb_onboarding_dismissed";

export function OnboardingChecklist({ totalMembers, totalSongs, totalSetlists, groupName }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true); // começa true para evitar flash
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isDismissed = localStorage.getItem(STORAGE_KEY) === "true";
    setDismissed(isDismissed);
  }, []);

  const steps: OnboardingStep[] = [
    {
      id: "group",
      icon: <Sparkles className="w-5 h-5" />,
      title: "Ministério criado",
      description: groupName ? `"${groupName}" está pronto para decolar.` : "Seu ministério foi criado com sucesso.",
      action: "Concluído",
      href: "/profile",
      done: true, // sempre concluído — chegou até aqui
    },
    {
      id: "members",
      icon: <Users className="w-5 h-5" />,
      title: "Adicionar membros",
      description: "Convide sua equipe. Cada músico terá acesso ao ministério.",
      action: "Adicionar membros",
      href: "/members",
      done: totalMembers > 1,
    },
    {
      id: "songs",
      icon: <Music className="w-5 h-5" />,
      title: "Montar o repertório",
      description: "Cadastre as músicas que seu ministério toca. A IA vai usar isso.",
      action: "Adicionar músicas",
      href: "/songs",
      done: totalSongs > 0,
    },
    {
      id: "schedule",
      icon: <Calendar className="w-5 h-5" />,
      title: "Criar a primeira escala",
      description: "Organize quem toca em cada culto — com ou sem IA.",
      action: "Criar escala",
      href: "/schedules",
      done: totalSetlists > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  // Não mostrar se já dispensado ou ainda hidratando
  if (!mounted || dismissed) return null;

  // Se tudo concluído, mostrar parabéns por 1 visita depois sumir
  if (allDone) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400">
                Ministério configurado! 🎉
              </p>
              <p className="text-sm text-muted-foreground">
                Tudo pronto. Seu time pode começar a usar o LiderWeb.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, "true");
              setDismissed(true);
            }}
            className="text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
        <div>
          <p className="font-semibold text-sm">Configure seu ministério</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount} de {steps.length} etapas concluídas
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Barra de progresso */}
          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-primary">{progress}%</span>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, "true");
              setDismissed(true);
            }}
            className="text-muted-foreground hover:text-foreground"
            title="Dispensar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-border/50">
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className={`flex items-center gap-4 px-5 py-4 transition-colors ${
              step.done
                ? "opacity-60"
                : "hover:bg-muted/30 cursor-pointer"
            }`}
            onClick={() => !step.done && router.push(step.href)}
          >
            {/* Ícone / check */}
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
              step.done
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>
              {step.done ? <CheckCircle2 className="w-5 h-5" /> : step.icon}
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>
                {step.title}
              </p>
              {!step.done && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {step.description}
                </p>
              )}
            </div>

            {/* CTA */}
            {!step.done && (
              <Button
                size="sm"
                variant="outline"
                className="flex-shrink-0 gap-1.5 text-xs"
                onClick={(e) => { e.stopPropagation(); router.push(step.href); }}
              >
                {step.action}
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
