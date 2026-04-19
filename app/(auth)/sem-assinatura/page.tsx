"use client";

import { signOut } from "next-auth/react";
import { AlertTriangle, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SemAssinaturaPage() {
  // Liberar scroll desta página (html/body têm overflow:hidden no app)
  useEffect(() => {
    document.documentElement.classList.add("page-scrollable");
    return () => document.documentElement.classList.remove("page-scrollable");
  }, []);

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
            A assinatura do seu grupo está inativa no momento e, por isso, o acesso à área logada foi pausado.
            <br />
            Fale com o administrador do grupo para reativar o plano.
          </p>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
              <Mail className="w-5 h-5" />
              <span className="font-semibold">O que fazer?</span>
            </div>
            <ul className="text-left text-sm text-blue-600 dark:text-blue-300 space-y-2">
              <li>• Avise o administrador/líder do grupo sobre a assinatura inativa</li>
              <li>• Peça a reativação ou contratação de um novo plano</li>
              <li>• Assim que o plano for ativado, seu acesso será liberado automaticamente</li>
            </ul>
          </div>
          
          <div className="mt-6 space-y-3">
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
