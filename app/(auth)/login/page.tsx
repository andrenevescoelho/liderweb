"use client";

import { useMemo, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const oauthErrorMessage = useMemo(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "google_email_required") {
      return "Não foi possível entrar com Google sem email verificado.";
    }
    if (errorParam === "OAuthSignin" || errorParam === "OAuthCallback") {
      return "Erro ao autenticar com Google. Tente novamente.";
    }
    return "";
  }, [searchParams]);

  const resolveSession = async (attempts = 5) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const session = await getSession();
      if (session?.user) return session;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return null;
  };



  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError("Erro ao iniciar login com Google");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Credenciais inválidas");
        return;
      }

      const session = await resolveSession();
      if (session?.user) {
        const user = session.user as any;
        if (user.role === "SUPERADMIN") return router.replace("/dashboard");
        if (user.hasActiveSubscription === false) {
          if (user.role === "ADMIN") return router.replace("/reativar-assinatura");
          return router.replace("/sem-assinatura");
        }
        return router.replace("/dashboard");
      }
      router.replace("/");
    } catch {
      setError("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.2),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_42%)]" />
      <Card className="relative w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-xl border border-primary/25 bg-primary/15 p-3">
              <Music className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">LiderWeb</h1>
          <p className="mt-2 text-sm text-muted-foreground">Entre na sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(error || oauthErrorMessage) && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error || oauthErrorMessage}</div>}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e?.target?.value ?? "")} className="pl-10" required />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e?.target?.value ?? "")} className="pl-10" required />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
          </Button>

          <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={handleGoogleLogin}>
            Entrar com Google
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Cadastre-se
          </Link>
        </p>
      </Card>
    </div>
  );
}
