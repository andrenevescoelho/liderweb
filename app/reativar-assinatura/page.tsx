"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { CreditCard, AlertTriangle, Loader2, ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ReativarAssinaturaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [error, setError] = useState("");
  
  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);
  
  const fetchSubscriptionStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subscription/status');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
        
        // Se assinatura está ativa, redirecionar para dashboard
        if (data.status === 'ACTIVE' || data.status === 'TRIALING') {
          router.replace('/dashboard');
        }
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError("");
    try {
      const res = await fetch('/api/subscription/portal', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Erro ao acessar portal de pagamento');
      }
    } catch (err) {
      setError('Erro ao acessar portal de pagamento');
    } finally {
      setPortalLoading(false);
    }
  };
  
  const handleViewPlans = () => {
    router.push('/planos');
  };
  
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-purple-500" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Verificando assinatura...</p>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
      <Card className="w-full max-w-lg p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assinatura Inativa</h1>
          
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            Sua assinatura do grupo não está ativa. Para continuar usando o LiderWeb, 
            você precisa reativar sua assinatura.
          </p>
          
          {subscription && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-left">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Status atual:</h3>
              <div className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-gray-500">Plano:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {subscription.planName || 'Nenhum'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className={`font-medium ${
                    subscription.status === 'CANCELED' ? 'text-red-500' :
                    subscription.status === 'PAST_DUE' ? 'text-yellow-500' :
                    'text-gray-500'
                  }`}>
                    {subscription.status === 'CANCELED' && 'Cancelada'}
                    {subscription.status === 'PAST_DUE' && 'Pagamento Pendente'}
                    {subscription.status === 'UNPAID' && 'Não Paga'}
                    {subscription.status === 'INACTIVE' && 'Inativa'}
                    {!['CANCELED', 'PAST_DUE', 'UNPAID', 'INACTIVE'].includes(subscription.status) && subscription.status}
                  </span>
                </p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}
          
          <div className="mt-6 space-y-3">
            {subscription?.stripeSubscriptionId ? (
              <Button 
                onClick={handleManageSubscription} 
                className="w-full"
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Gerenciar Pagamento
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleViewPlans} className="w-full">
                <CreditCard className="w-5 h-5 mr-2" />
                Ver Planos Disponíveis
              </Button>
            )}
            
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
