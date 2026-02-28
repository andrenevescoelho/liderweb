"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, CreditCard, Loader2, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SemAssinaturaPage() {
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError("");

    try {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Não foi possível acessar o portal de pagamento");
      }
    } catch (_err) {
      setError("Não foi possível acessar o portal de pagamento");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
      <Card className="w-full max-w-lg p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
              <AlertTriangle className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assinatura do Grupo Inativa</h1>
          
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            O seu grupo não possui uma assinatura ativa no momento. 
            Por favor, entre em contato com o líder ou administrador do seu grupo 
            para resolver esta situação.
          </p>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
              <Mail className="w-5 h-5" />
              <span className="font-semibold">O que fazer?</span>
            </div>
            <ul className="text-left text-sm text-blue-600 dark:text-blue-300 space-y-2">
              <li>• Entre em contato com o líder do seu ministério</li>
              <li>• Informe que a assinatura do grupo está inativa</li>
              <li>• Aguarde o líder reativar a assinatura</li>
            </ul>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <Button onClick={handleManageSubscription} className="w-full" disabled={portalLoading}>
              {portalLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Tentar Reativar Assinatura
                </>
              )}
            </Button>

            <Button variant="outline" onClick={handleLogout} className="w-full">
              <LogOut className="w-5 h-5 mr-2" />
              Sair da Conta
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
