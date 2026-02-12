"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
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
  
  // Criar novo grupo diretamente
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
  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-purple-500" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Validando convite...</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Seu email de acesso:
              </p>
              <p className="font-medium text-gray-700 dark:text-gray-300 mt-1">{email}</p>
            </div>
            <Link href="/login" className="mt-6 inline-block">
              <Button>Fazer Login</Button>
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
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
              <Music className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          
          {mode === 'choose' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Criar Conta</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Como você deseja começar?</p>
            </>
          )}
          
          {mode === 'invite' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bem-vindo!</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Você foi convidado para <span className="text-purple-500 font-medium">{inviteData?.groupName}</span>
              </p>
            </>
          )}
          
          {mode === 'new-group' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Criar Novo Grupo</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Preencha os dados do seu ministério</p>
            </>
          )}
        </div>
        
        {error && (
          <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        
        {/* Tela de escolha */}
        {mode === 'choose' && (
          <div className="space-y-4">
            <button
              onClick={() => setMode('new-group')}
              className="w-full p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-500 transition-colors text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900 group-hover:bg-purple-200 dark:group-hover:bg-purple-800 transition-colors">
                  <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Criar novo grupo</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Sou líder e quero cadastrar meu ministério</p>
                </div>
              </div>
            </button>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">ou</span>
              </div>
            </div>
            
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Recebeu um convite?</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Se você recebeu um convite por email, clique no link do email para se cadastrar automaticamente no grupo.
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
        
        {/* Formulário de convite */}
        {mode === 'invite' && (
          <form onSubmit={handleInviteSignup} className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Convite válido para {inviteData?.email}</span>
            </div>
            
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e?.target?.value ?? '')}
                className="pl-10"
                required
              />
            </div>
            
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                value={inviteData?.email || ''}
                className="pl-10 bg-gray-100 dark:bg-gray-800"
                disabled
              />
            </div>
            
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="password"
                placeholder="Criar senha"
                value={password}
                onChange={(e) => setPassword(e?.target?.value ?? '')}
                className="pl-10"
                required
                minLength={6}
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Criar Conta e Entrar no Grupo"
              )}
            </Button>
          </form>
        )}
        
        {/* Formulário de novo grupo */}
        {mode === 'new-group' && (
          <form onSubmit={handleNewGroupRequest} className="space-y-4">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Nome do grupo/ministério"
                value={groupName}
                onChange={(e) => setGroupName(e?.target?.value ?? '')}
                className="pl-10"
                required
              />
            </div>
            
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Palavra-chave do grupo"
                value={keyword}
                onChange={(e) => setKeyword(e?.target?.value ?? '')}
                className="pl-10"
                required
              />
              <p className="text-xs text-gray-500 mt-1 ml-1">Uma palavra que identifica seu grupo</p>
            </div>
            
            <hr className="border-gray-200 dark:border-gray-700" />
            
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e?.target?.value ?? '')}
                className="pl-10"
                required
              />
            </div>
            
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="email"
                placeholder="Seu email"
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
                placeholder="Criar senha"
                value={password}
                onChange={(e) => setPassword(e?.target?.value ?? '')}
                className="pl-10"
                required
                minLength={6}
              />
            </div>
            
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-400 flex items-center gap-2">
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                <span>Após criar o grupo, você será redirecionado para escolher um plano. 
                Teste grátis por 7 dias!</span>
              </p>
            </div>
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Criar Grupo e Continuar"
              )}
            </Button>
            
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
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
