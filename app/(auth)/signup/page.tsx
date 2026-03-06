"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Music, Mail, Lock, User, Loader2, Building2, Key, CheckCircle, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type SignupMode = "choose" | "invite" | "new-group" | "success";

interface InviteData {
  email: string;
  groupName: string;
  groupId: string;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.2),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_42%)]" />
      {children}
    </div>
  );
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get("token");

  const [mode, setMode] = useState<SignupMode>("choose");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [groupName, setGroupName] = useState("");
  const [keyword, setKeyword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!inviteToken) return;

      setValidatingToken(true);
      try {
        const res = await fetch(`/api/invites/${inviteToken}`);
        const data = await res.json();

        if (res.ok && data.valid) {
          setInviteData({
            email: data.email,
            groupName: data.groupName,
            groupId: data.groupId,
          });
          setEmail(data.email);
          setMode("invite");
        } else {
          setError(data.error || "Convite inválido");
          setMode("choose");
        }
      } catch {
        setError("Erro ao validar convite");
        setMode("choose");
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [inviteToken]);

  const handleInviteSignup = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: inviteData?.email,
          password,
          token: inviteToken,
          groupId: inviteData?.groupId,
        }),
      });

      const data = await res.json();

      if (!res?.ok) {
        setError(data?.error ?? "Erro ao criar conta");
        return;
      }

      const result = await signIn("credentials", {
        email: inviteData?.email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        router.replace("/dashboard");
      } else {
        setError("Conta criada. Faça login.");
      }
    } catch {
      setError("Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const handleNewGroupRequest = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/signup/new-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName,
          keyword,
          userName: name,
          userEmail: email,
          userPassword: password,
        }),
      });

      const data = await res.json();

      if (!res?.ok) {
        setError(data?.error ?? "Erro ao criar grupo");
        return;
      }

      const loginResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        router.replace("/planos");
      } else {
        setMode("success");
      }
    } catch {
      setError("Erro ao criar grupo");
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <AuthShell>
        <Card className="relative w-full max-w-md p-8 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Validando convite...</p>
        </Card>
      </AuthShell>
    );
  }

  if (mode === "success") {
    return (
      <AuthShell>
        <Card className="relative w-full max-w-md p-8">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-emerald-500/15 p-3">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold">Grupo Criado!</h1>
            <p className="mt-4 text-muted-foreground">
              Seu grupo <strong className="text-primary">{groupName}</strong> foi criado com sucesso.
            </p>
            <p className="mt-2 text-muted-foreground">Faça login para escolher seu plano e começar a usar.</p>
            <div className="mt-6 rounded-lg border bg-muted/35 p-4">
              <p className="text-sm text-muted-foreground">Seu email de acesso:</p>
              <p className="mt-1 font-medium">{email}</p>
            </div>
            <Link href="/login" className="mt-6 inline-block">
              <Button>Fazer Login</Button>
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card className="relative w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-xl border border-primary/25 bg-primary/15 p-3">
              <Music className="h-8 w-8 text-primary" />
            </div>
          </div>

          {mode === "choose" && (
            <>
              <h1 className="text-2xl font-semibold">Criar Conta</h1>
              <p className="mt-2 text-muted-foreground">Como você deseja começar?</p>
            </>
          )}

          {mode === "invite" && (
            <>
              <h1 className="text-2xl font-semibold">Bem-vindo!</h1>
              <p className="mt-2 text-muted-foreground">
                Você foi convidado para <span className="font-medium text-primary">{inviteData?.groupName}</span>
              </p>
            </>
          )}

          {mode === "new-group" && (
            <>
              <h1 className="text-2xl font-semibold">Criar Novo Grupo</h1>
              <p className="mt-2 text-muted-foreground">Preencha os dados do seu ministério</p>
            </>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {mode === "choose" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("new-group")}
              className="group w-full rounded-lg border p-4 text-left transition-colors hover:border-primary"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary/15 p-2 transition-colors group-hover:bg-primary/25">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Criar novo grupo</h3>
                  <p className="text-sm text-muted-foreground">Sou líder e quero cadastrar meu ministério</p>
                </div>
              </div>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/35 p-4">
              <div className="mb-2 flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Recebeu um convite?</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Se você recebeu um convite por email, clique no link do email para se cadastrar automaticamente no grupo.
              </p>
            </div>

            <p className="pt-4 text-center text-muted-foreground">
              Já tem conta?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        )}

        {mode === "invite" && (
          <form onSubmit={handleInviteSignup} className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm">Convite válido para {inviteData?.email}</span>
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e?.target?.value ?? "")} className="pl-10" required />
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" value={inviteData?.email || ""} className="pl-10" disabled />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Criar senha"
                value={password}
                onChange={(e) => setPassword(e?.target?.value ?? "")}
                className="pl-10"
                required
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar Conta e Entrar no Grupo"}
            </Button>
          </form>
        )}

        {mode === "new-group" && (
          <form onSubmit={handleNewGroupRequest} className="space-y-4">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Nome do grupo/ministério"
                value={groupName}
                onChange={(e) => setGroupName(e?.target?.value ?? "")}
                className="pl-10"
                required
              />
            </div>

            <div className="relative">
              <Key className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Palavra-chave do grupo"
                value={keyword}
                onChange={(e) => setKeyword(e?.target?.value ?? "")}
                className="pl-10"
                required
              />
              <p className="ml-1 mt-1 text-xs text-muted-foreground">Uma palavra que identifica seu grupo</p>
            </div>

            <hr className="border-border" />

            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e?.target?.value ?? "")} className="pl-10" required />
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" placeholder="Seu email" value={email} onChange={(e) => setEmail(e?.target?.value ?? "")} className="pl-10" required />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Criar senha"
                value={password}
                onChange={(e) => setPassword(e?.target?.value ?? "")}
                className="pl-10"
                required
                minLength={6}
              />
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
              <p className="flex items-center gap-2 text-sm text-primary">
                <CreditCard className="h-4 w-4 flex-shrink-0" />
                <span>Após criar o grupo, você será redirecionado para escolher um plano. Teste grátis por 7 dias!</span>
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Criar Grupo e Continuar"}
            </Button>

            <button type="button" onClick={() => setMode("choose")} className="w-full text-sm text-muted-foreground hover:text-foreground">
              ← Voltar
            </button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
        </AuthShell>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
