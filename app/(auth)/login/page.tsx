"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Music, Mail, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const resolveSession = async (attempts = 5) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const session = await getSession();

      if (session?.user) {
        return session;
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Credenciais inválidas");
        return;
      }
      
      // Buscar sessão para verificar status da assinatura.
      // Com callbacks JWT mais complexos (RBAC), a sessão pode demorar alguns ms para sincronizar.
      const session = await resolveSession();
      
      if (session?.user) {
        const user = session.user as any;
        
        // SuperAdmin sempre pode acessar
        if (user.role === "SUPERADMIN") {
          router.replace("/dashboard");
          return;
        }
        
        // Verificar assinatura
        if (user.hasActiveSubscription === false) {
          // Admin vai para página de reativação
          if (user.role === "ADMIN") {
            router.replace("/reativar-assinatura");
            return;
          }
          
          // Membros vão para página informativa
          router.replace("/sem-assinatura");
          return;
        }
        
        // Assinatura ativa - ir para dashboard
        router.replace("/dashboard");
        return;
      }

      // Fallback: se autenticou mas a sessão ainda não propagou no cliente,
      // redireciona para a rota raiz que já resolve sessão no servidor.
      router.replace("/");
    } catch (err) {
      setError("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
              <Music className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LiderWeb</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Entre na sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e?.target?.value ?? '')}
              className="pl-10"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e?.target?.value ?? '')}
              className="pl-10"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        <p className="text-center mt-6 text-gray-600 dark:text-gray-400">
          Não tem conta?{" "}
          <Link href="/signup" className="text-purple-600 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </Card>
    </div>
  );
}
