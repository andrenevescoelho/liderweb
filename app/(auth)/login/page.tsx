"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, getSession, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");

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

  const callbackAfterLogin = inviteToken ? `/signup?token=${inviteToken}` : "/dashboard";

  useEffect(() => {
    if (status === "authenticated" && !inviteToken) {
      router.replace("/dashboard");
    }
  }, [inviteToken, router, status]);

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: callbackAfterLogin });
    } catch {
      setError("Erro ao iniciar login com Google");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setCredentialsLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // Verificar se é erro de rate limit (mensagem começa com "Muitas tentativas")
        if (result.error.includes("Muitas tentativas") || result.error.includes("tentativas")) {
          setError(result.error);
        } else {
          setError("Email ou senha incorretos. Se você entrou com Google anteriormente, use o botão 'Entrar com Google'.");
        }
        return;
      }

      const session = await resolveSession();
      if (session?.user) {
        if (inviteToken) {
          return router.replace(`/signup?token=${inviteToken}`);
        }
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
      setError("Erro ao fazer login. Tente usar o botão 'Entrar com Google' se sua conta foi criada por ele.");
    } finally {
      setCredentialsLoading(false);
    }
  };

  const features = [
    { icon: "🎵", text: "Escalas organizadas, sem confusão de última hora" },
    { icon: "🎓", text: "Professor IA que treina cada músico individualmente" },
    { icon: "💬", text: "Comunicação centralizada com toda a equipe" },
    { icon: "🎚️", text: "Multitracks e ensaios ao alcance de um clique" },
  ];

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      {/* Lado esquerdo — proposta de valor */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white" style={{ background: "linear-gradient(135deg, #0f1728 0%, #0d1f35 60%, #0a1a2e 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2">
            <Image src="/favicon.svg" alt="LiderWeb" width={28} height={28} className="h-7 w-7" />
          </div>
          <div>
            <span className="text-lg font-bold">LiderWeb</span>
            <span className="ml-2 text-xs text-white/50">by multitrackgospel.com</span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold leading-tight">
              Organize, treine e{" "}
              <span style={{ color: "#1cc9a8" }}>eleve o nível</span>{" "}
              do seu ministério.
            </h1>
            <p className="mt-4 text-base text-white/60">
              Chega de ensaios desorganizados, músicos despreparados e escalas confusas.
            </p>
          </div>

          <div className="space-y-3">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/5 px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm text-white/90">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/25">
          Mais de 100 ministérios confiam no LiderWeb.
        </p>
      </div>

      {/* Lado direito — formulário */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6">
        <Card className="relative w-full max-w-md p-8">
          <div className="mb-8 text-center">
            <div className="mb-4 flex justify-center lg:hidden">
              <div className="rounded-xl border border-primary/25 bg-primary/15 p-3">
                <Image src="/favicon.svg" alt="LiderWeb" width={32} height={32} className="h-8 w-8" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold">Entrar na sua conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">Bem-vindo de volta ao seu ministério</p>
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

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Esqueci minha senha
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={credentialsLoading || googleLoading}>
            {credentialsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou continue com Google</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" disabled={credentialsLoading || googleLoading} onClick={handleGoogleLogin}>
            {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar com Google"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link href={inviteToken ? `/signup?token=${inviteToken}` : "/signup"} className="text-primary hover:underline">
            Cadastre-se
          </Link>
        </p>
      </Card>
      </div>
    </div>
  );
}
