"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Music, Mail, Lock, User, Loader2, Building2, Key, CheckCircle, AlertCircle, CreditCard, Phone, MapPin, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { maskDocument, maskPhone, validateDocument, onlyDigits } from "@/lib/document-validation";

type SignupMode = 'choose' | 'invite' | 'owner-info' | 'verify-email' | 'new-group' | 'success';

interface InviteData {
  email: string;
  groupName: string;
  groupId: string;
}

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

// Indicador de progresso do wizard
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
            i + 1 < current ? "bg-green-500 text-white" :
            i + 1 === current ? "bg-purple-600 text-white" :
            "bg-gray-200 dark:bg-gray-700 text-gray-400"
          }`}>
            {i + 1 < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-8 h-0.5 transition-all ${i + 1 < current ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function SignupContent() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get('token');
  const modeParam = searchParams?.get('mode');

  const [mode, setMode] = useState<SignupMode>(
    modeParam === 'new-group' ? 'owner-info' : 'choose'
  );
  const [inviteData, setInviteData] = useState<InviteData | null>(null);

  // Dados pessoais (etapa 1)
  const [ownerName, setOwnerName]       = useState("");
  const [ownerDocument, setOwnerDocument] = useState("");
  const [ownerPhone, setOwnerPhone]     = useState("");
  const [ownerCity, setOwnerCity]       = useState("");
  const [ownerState, setOwnerState]     = useState("");
  const [docError, setDocError]         = useState("");

  // Dados de conta
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");

  // Dados do ministério (etapa 3)
  const [groupName, setGroupName]       = useState("");
  const [keyword, setKeyword]           = useState("");
  const [denomination, setDenomination] = useState("");

  // Estados gerais
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifyToken, setVerifyToken]   = useState("");
  const [sendingToken, setSendingToken] = useState(false);
  const [validatingToken, setValidatingToken] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const googleCallbackUrl = useMemo(() => {
    return inviteToken ? `/signup?token=${inviteToken}` : "/signup";
  }, [inviteToken]);

  // Validar convite
  useEffect(() => {
    if (!inviteToken) return;
    const validate = async () => {
      setValidatingToken(true);
      try {
        const res = await fetch(`/api/invites/${inviteToken}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setInviteData({ email: data.email, groupName: data.groupName, groupId: data.groupId });
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
    validate();
  }, [inviteToken]);

  // Aceitar convite para usuário já autenticado (SSO)
  useEffect(() => {
    if (!inviteToken || !session?.user || status !== "authenticated" || validatingToken) return;
    const accept = async () => {
      setAcceptingInvite(true);
      try {
        const res = await fetch(`/api/invites/${inviteToken}/accept`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Não foi possível aceitar o convite"); return; }
        router.replace("/dashboard");
      } catch { setError("Erro ao aceitar convite"); }
      finally { setAcceptingInvite(false); }
    };
    accept();
  }, [inviteToken, router, session?.user, status, validatingToken]);

  // Redirecionar usuário já autenticado sem grupo
  useEffect(() => {
    if (!inviteToken && status === "authenticated") {
      const user = session?.user as any;
      if (!user?.groupId && user?.role !== "SUPERADMIN") {
        if (mode === "owner-info" || mode === "verify-email" || mode === "new-group") return;
        router.replace("/sem-grupo");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [inviteToken, router, status, session, mode]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGoogleLogin = async () => {
    setError("");
    await signIn("google", { callbackUrl: googleCallbackUrl });
  };

  // Etapa 1 → 2: validar dados pessoais e ir para verificação de email
  const handleOwnerInfoNext = () => {
    setError("");
    setDocError("");

    if (!ownerName.trim()) { setError("Informe seu nome completo."); return; }
    if (!ownerPhone.trim() || onlyDigits(ownerPhone).length < 10) { setError("Informe um telefone válido com DDD."); return; }
    if (!ownerCity.trim()) { setError("Informe a cidade."); return; }
    if (!ownerState) { setError("Selecione o estado."); return; }

    const docResult = validateDocument(ownerDocument);
    if (!docResult.valid) {
      setDocError(
        onlyDigits(ownerDocument).length === 0 ? "Informe o CPF ou CNPJ." :
        `${docResult.type || "CPF/CNPJ"} inválido. Verifique os dígitos.`
      );
      return;
    }

    setMode('verify-email');
  };

  // Enviar código de verificação de e-mail
  const handleSendVerifyToken = async () => {
    if (!email || !email.includes("@")) { setError("Digite um e-mail válido."); return; }
    setSendingToken(true);
    setError("");
    try {
      const res = await fetch("/api/signup/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao enviar código"); return; }
    } catch { setError("Erro ao enviar código. Tente novamente."); }
    finally { setSendingToken(false); }
  };

  // Verificar código digitado
  const handleVerifyToken = async () => {
    if (!verifyToken || verifyToken.length !== 6) { setError("Digite o código de 6 dígitos."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/signup/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, token: verifyToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailVerified(true);
        setMode("new-group");
      } else {
        setError(data.error ?? "Código inválido");
      }
    } catch { setError("Erro ao verificar código."); }
    finally { setLoading(false); }
  };

  // Etapa 3: criar ministério
  const handleNewGroupRequest = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);

    try {
      // Usuário autenticado via Google sem grupo
      if (status === "authenticated") {
        const res = await fetch("/api/signup/attach-group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupName, keyword }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data?.error ?? "Erro ao criar ministério"); return; }
        router.replace("/planos");
        return;
      }

      const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) { setError("E-mail inválido."); setLoading(false); return; }

      const res = await fetch("/api/signup/new-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName,
          keyword,
          denomination,
          userName: ownerName,
          userEmail: email,
          userPassword: password,
          ownerDocument,
          ownerPhone,
          ownerCity,
          ownerState,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Erro ao criar grupo"); return; }

      const loginResult = await signIn("credentials", { email, password, redirect: false });
      if (loginResult?.ok) {
        router.replace("/planos");
      } else {
        setMode('success');
      }
    } catch { setError("Erro ao criar grupo"); }
    finally { setLoading(false); }
  };

  // Convite com e-mail/senha
  const handleInviteSignup = async (e: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ownerName, email: inviteData?.email, password, token: inviteToken, groupId: inviteData?.groupId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Erro ao criar conta"); return; }
      const result = await signIn("credentials", { email: inviteData?.email, password, redirect: false });
      if (result?.ok) router.replace("/dashboard");
      else setError("Conta criada. Faça login.");
    } catch { setError("Erro ao criar conta"); }
    finally { setLoading(false); }
  };

  // ── Telas de loading ───────────────────────────────────────────────────────

  if (validatingToken || acceptingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-purple-500" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {acceptingInvite ? "Finalizando aceite do convite..." : "Validando convite..."}
          </p>
        </Card>
      </div>
    );
  }

  if (mode === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Ministério criado!</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            <strong className="text-purple-600">{groupName}</strong> está pronto.
            Faça login para escolher seu plano.
          </p>
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-600 dark:text-gray-400">
            <strong>E-mail:</strong> {email}
          </div>
          <Link href="/login" className="mt-6 inline-block w-full rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 transition">
            Ir para Login
          </Link>
        </Card>
      </div>
    );
  }

  // ── Layout principal ───────────────────────────────────────────────────────

  const isNewGroupFlow = ['owner-info', 'verify-email', 'new-group'].includes(mode);
  const currentStep = mode === 'owner-info' ? 1 : mode === 'verify-email' ? 2 : mode === 'new-group' ? 3 : 0;
  const stepTitle = mode === 'owner-info' ? 'Seus dados' : mode === 'verify-email' ? 'Verificar e-mail' : mode === 'new-group' ? 'Dados do ministério' : '';
  const stepSubtitle = mode === 'owner-info' ? 'Precisamos identificar o responsável' : mode === 'verify-email' ? 'Confirme seu e-mail' : mode === 'new-group' ? 'Quase lá! Configure seu ministério' : '';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-900 via-gray-900 to-gray-900">
      <Card className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3 rounded-xl bg-purple-100 dark:bg-purple-900 mb-3">
            <Music className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">LiderWeb</h1>
          {isNewGroupFlow && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{stepSubtitle}</p>
          )}
          {!isNewGroupFlow && mode === 'choose' && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">Como você deseja começar?</p>
          )}
          {mode === 'invite' && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Você foi convidado para <strong>{inviteData?.groupName}</strong>
            </p>
          )}
        </div>

        {/* Indicador de etapas */}
        {isNewGroupFlow && <StepIndicator current={currentStep} total={3} />}

        {/* Erros globais */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* ── Etapa 0: Escolha ────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="space-y-4">
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continuar com Google
            </Button>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-gray-900 px-2 text-gray-500">ou</span>
              </div>
            </div>
            <Button type="button" className="w-full" onClick={() => setMode('owner-info')}>
              <Building2 className="w-5 h-5 mr-2" />
              Sou líder e quero cadastrar meu ministério
            </Button>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Recebeu um convite?</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Clique no link do seu e-mail de convite para entrar no ministério.
              </p>
            </div>
            <p className="text-center text-gray-600 dark:text-gray-400 pt-2">
              Já tem conta?{" "}
              <Link href="/login" className="text-purple-600 hover:underline">Entrar</Link>
            </p>
          </div>
        )}

        {/* ── Etapa 1: Dados pessoais ─────────────────────────────────────── */}
        {mode === 'owner-info' && (
          <div className="space-y-4">
            {/* Nome */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Seu nome completo"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="pl-10"
                required
              />
            </div>

            {/* CPF / CNPJ */}
            <div className="space-y-1">
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="CPF ou CNPJ"
                  value={ownerDocument}
                  onChange={(e) => {
                    const masked = maskDocument(e.target.value);
                    setOwnerDocument(masked);
                    setDocError("");
                  }}
                  className={`pl-10 font-mono ${docError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  maxLength={18}
                  required
                />
              </div>
              {docError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {docError}
                </p>
              )}
              {!docError && onlyDigits(ownerDocument).length > 0 && (() => {
                const r = validateDocument(ownerDocument);
                return r.valid ? (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {r.type} válido
                  </p>
                ) : null;
              })()}
            </div>

            {/* Telefone */}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="tel"
                placeholder="Telefone / WhatsApp com DDD"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(maskPhone(e.target.value))}
                className="pl-10"
                maxLength={15}
                required
              />
            </div>

            {/* Cidade + Estado */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Cidade"
                  value={ownerCity}
                  onChange={(e) => setOwnerCity(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <select
                value={ownerState}
                onChange={(e) => setOwnerState(e.target.value)}
                className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="">UF</option>
                {ESTADOS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={handleOwnerInfoNext}
            >
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>

            <button
              type="button"
              onClick={() => setMode('choose')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ← Voltar
            </button>
          </div>
        )}

        {/* ── Etapa 2: Verificação de e-mail ─────────────────────────────── */}
        {mode === 'verify-email' && (
          <div className="space-y-4">
            {/* Campo de e-mail (só aparece se ainda não enviou o código) */}
            {!emailVerified && (
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="Seu e-mail"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); }}
                    className="pl-10"
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-sm"
                  onClick={async () => {
                    setError("");
                    await handleSendVerifyToken();
                  }}
                  disabled={sendingToken || !email.includes("@")}
                >
                  {sendingToken ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</> : "Enviar código de verificação"}
                </Button>
              </div>
            )}

            {/* Código */}
            {email && email.includes("@") && (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  Enviamos um código de 6 dígitos para <strong>{email}</strong>
                </p>
                <input
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ""))}
                  className="w-full h-14 text-center text-2xl font-mono tracking-widest rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleVerifyToken}
                  disabled={loading || verifyToken.length !== 6}
                >
                  {loading ? "Verificando..." : "Confirmar código"}
                </Button>
                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                  onClick={handleSendVerifyToken}
                  disabled={sendingToken}
                >
                  {sendingToken ? "Reenviando..." : "Reenviar código"}
                </button>
              </>
            )}

            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode("owner-info")}
            >
              ← Voltar
            </button>
          </div>
        )}

        {/* ── Etapa 3: Dados do ministério ────────────────────────────────── */}
        {mode === 'new-group' && (
          <form onSubmit={handleNewGroupRequest} className="space-y-4">
            {status === "authenticated" ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">Criando como <strong>{(session?.user as any)?.email}</strong></span>
              </div>
            ) : (
              <>
                <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
                  Continuar com Google
                </Button>
                <p className="text-xs text-center text-gray-500">Ou crie com e-mail e senha</p>
              </>
            )}

            {/* Nome do ministério */}
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Nome do ministério"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="pl-10"
                required
              />
            </div>

            {/* Denominação */}
            <div className="relative">
              <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Denominação / Igreja (ex: Assembleia de Deus)"
                value={denomination}
                onChange={(e) => setDenomination(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Palavra-chave */}
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Palavra-chave do grupo"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-10"
                required
              />
              <p className="text-xs text-gray-500 mt-1 ml-1">Uma palavra que identifica seu grupo</p>
            </div>

            {/* Campos de conta (só para não autenticados) */}
            {status !== "authenticated" && (
              <>
                <hr className="border-gray-200 dark:border-gray-700" />
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="Criar senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </>
            )}

            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="text-sm text-purple-700 dark:text-purple-400 flex items-center gap-2">
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                Após criar o ministério, você escolhe o plano. Teste grátis por 7 dias!
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Criar ministério e continuar"}
            </Button>

            <button
              type="button"
              onClick={() => setMode('verify-email')}
              className="w-full text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ← Voltar
            </button>
          </form>
        )}

        {/* ── Convite ─────────────────────────────────────────────────────── */}
        {mode === 'invite' && (
          <form onSubmit={handleInviteSignup} className="space-y-4">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Convite válido para {inviteData?.email}</span>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
              Continuar com Google
            </Button>
            <p className="text-xs text-center text-gray-500">Ou continue com e-mail e senha</p>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Seu nome" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="pl-10" required />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="email" value={inviteData?.email || ''} className="pl-10 bg-gray-100 dark:bg-gray-800" disabled />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="password" placeholder="Criar senha" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Criar conta e entrar no grupo"}
            </Button>
            <Link href={`/login?token=${inviteToken ?? ''}`} className="block text-center text-sm text-purple-600 hover:underline">
              Já tenho conta, entrar com e-mail e senha
            </Link>
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
