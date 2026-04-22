"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Music, Mail, Lock, User, Loader2, Building2, Key, CheckCircle, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type SignupMode = 'choose' | 'invite' | 'new-group' | 'success';

interface InviteData {
  email: string;
  groupName: string;
  groupId: string;
}

function SignupContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get('token');

  const [mode, setMode] = useState<SignupMode>('choose');
  const [inviteData, setInviteData] = useState<InviteData | null>(null);

  // Formulário comum
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Formulário de novo grupo
  const [groupName, setGroupName] = useState("");
  const [keyword, setKeyword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const googleCallbackUrl = useMemo(() => {
    if (inviteToken) {
      return `/signup?token=${inviteToken}`;
    }
    return "/signup";
  }, [inviteToken]);

  // Validar token de convite se presente
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
          setMode('invite');
        } else {
          setError(data.error || 'Convite inválido');
          setMode('choose');
        }
      } catch {
        setError('Erro ao validar convite');
        setMode('choose');
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [inviteToken]);

  // Aceitar convite para usuário autenticado (incluindo SSO)
  useEffect(() => {
    const acceptInvite = async () => {
      if (!inviteToken || !session?.user || status !== "authenticated" || validatingToken) {
        return;
      }

      setAcceptingInvite(true);
      try {
        const res = await fetch(`/api/invites/${inviteToken}/accept`, {
          method: "POST",
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Não foi possível aceitar o convite com este email");
          return;
        }

        router.replace("/dashboard");
      } catch {
        setError("Erro ao aceitar convite");
      } finally {
        setAcceptingInvite(false);
      }
    };

    acceptInvite();
  }, [inviteToken, router, session?.user, status, validatingToken]);

  useEffect(() => {
    if (!inviteToken && status === "authenticated") {
      const user = session?.user as any;
      if (!user?.groupId && user?.role !== "SUPERADMIN") {
        // Usuário autenticado mas sem grupo — mostrar tela de sem grupo
        router.replace("/sem-grupo");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [inviteToken, router, status, session]);

  // Cadastro com convite
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

  const handleGoogleLogin = async () => {
    setError("");
    await signIn("google", { callbackUrl: googleCallbackUrl });
  };

  // Criar novo grupo diretamente
  const handleNewGroupRequest = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      // Validação básica de email no frontend
      const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        setError("Por favor, insira um endereço de email válido.");
        setLoading(false);
        return;
      }

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

      // Fazer login automaticamente
      const loginResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginResult?.ok) {
        // Redirecionar para escolher plano
        router.replace("/planos");
      } else {
        setMode('success');
      }
    } catch {
      setError("Erro ao criar grupo");
    } finally {
      setLoading(false);
    }
  };

  // Tela de carregamento ao validar token
  if (validatingToken || acceptingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-purple-500" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">{acceptingInvite ? "Finalizando aceite do convite..." : "Validando convite..."}</p>
        </Card>
      </div>
    );
  }

  // Tela de sucesso - grupo criado
  if (mode === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Grupo Criado!</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-4">
              Seu grupo <strong className="text-purple-600">{groupName}</strong> foi criado com sucesso.
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Faça login para escolher seu plano e começar a usar.
            </p>
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Email:</strong> {email}
              </p>
            </div>
            <Link
              href="/login"
              className="mt-6 inline-block w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition"
            >
              Ir para Login
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-xl bg-purple-100 dark:bg-purple-900 mb-4">
            <Music className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LiderWeb</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {mode === 'invite' ? `Você foi convidado para ${inviteData?.groupName}` :
             mode === 'new-group' ? 'Crie seu ministério' :
             'Como você deseja começar?'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-4">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continuar com Google
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-gray-900 px-2 text-gray-500">ou</span></div>
            </div>

            <Button type="button" className="w-full" onClick={() => setMode('new-group')}>
              <Building2 className="w-5 h-5 mr-2" />
              Sou líder e quero cadastrar meu ministério
            </Button>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Recebeu um convite?</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Se você recebeu um convite por email, clique no link do email para entrar no ministério.
              </p>
            </div>

            <p className="text-center text-gray-600 dark:text-gray-400 pt-4">
              Já tem conta?{" "}
              <Link href="/login" className="text-purple-600 hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        )}

        {mode === 'invite' && (
          <form onSubmit={handleInviteSignup} className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Convite válido para {inviteData?.email}</span>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continuar com Google
            </Button>
            <p className="text-xs text-center text-gray-500">Ou continue com email e senha</p>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e?.target?.value ?? '')} className="pl-10" required />
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="email" value={inviteData?.email || ''} className="pl-10 bg-gray-100 dark:bg-gray-800" disabled />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="password" placeholder="Criar senha" value={password} onChange={(e) => setPassword(e?.target?.value ?? '')} className="pl-10" required minLength={6} />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Criar Conta e Entrar no Grupo"}
            </Button>

            <Link href={`/login?token=${inviteToken ?? ''}`} className="block text-center text-sm text-purple-600 hover:underline">
              Já tenho conta, entrar com email e senha
            </Link>
          </form>
        )}

        {mode === 'new-group' && (
          <form onSubmit={handleNewGroupRequest} className="space-y-4">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continuar com Google
            </Button>
            <p className="text-xs text-center text-gray-500">Ou crie com email e senha</p>

            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Nome do grupo/ministério" value={groupName} onChange={(e) => setGroupName(e?.target?.value ?? '')} className="pl-10" required />
            </div>

            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Palavra-chave do grupo" value={keyword} onChange={(e) => setKeyword(e?.target?.value ?? '')} className="pl-10" required />
              <p className="text-xs text-gray-500 mt-1 ml-1">Uma palavra que identifica seu grupo</p>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e?.target?.value ?? '')} className="pl-10" required />
            </div>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="email" placeholder="Seu email" value={email} onChange={(e) => setEmail(e?.target?.value ?? '')} className="pl-10" required />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="password" placeholder="Criar senha" value={password} onChange={(e) => setPassword(e?.target?.value ?? '')} className="pl-10" required minLength={6} />
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-400 flex items-center gap-2">
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                <span>Após criar o grupo, você será redirecionado para escolher um plano.
                Teste grátis por 7 dias!</span>
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Criar Grupo e Continuar"}
            </Button>

            <button type="button" onClick={() => setMode('choose')} className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              ← Voltar
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
