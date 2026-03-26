"use client";

import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  moduleLabel: string;
  isAdmin: boolean;
  onUpgrade?: () => void;
};

export function ModuleAccessOverlay({ moduleLabel, isAdmin, onUpgrade }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px] p-4">
      <Card className="max-w-lg w-full border-primary/25 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-primary" />
            Recurso indisponível no plano atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            O recurso <strong>{moduleLabel}</strong> não está incluído na assinatura do seu grupo.
          </p>
          {isAdmin ? (
            <>
              <p className="text-muted-foreground">
                Faça upgrade para um plano com este módulo e libere o acesso imediatamente.
              </p>
              <Button onClick={onUpgrade} className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4 mr-2" />
                Ver planos com este recurso
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              Fale com o administrador da conta para contratar um plano que inclua este módulo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

