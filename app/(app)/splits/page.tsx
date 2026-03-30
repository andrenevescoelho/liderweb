"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/types";
import {
  Scissors, Music2, Headphones, Layers, Clock, CheckCircle2,
  Loader2, Mail, Sparkles, Zap, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Music2, title: "Voz isolada", description: "Extraia apenas a voz principal da música" },
  { icon: Headphones, title: "Instrumentos separados", description: "Baixo, bateria, guitarra e teclado em faixas individuais" },
  { icon: Layers, title: "Backing track", description: "Música sem a voz, perfeita para ensaios" },
  { icon: Zap, title: "Alta qualidade", description: "Processamento com IA de última geração" },
];

const USECASES = [
  "Ensaiar com a backing track da sua música favorita",
  "Estudar a linha de baixo ou guitarra isolada",
  "Criar playbacks personalizados para o ministério",
  "Extrair a voz para analisar a melodia",
  "Preparar arranjos e cifras com mais precisão",
];

export default function SplitsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;

  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/splits/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao registrar"); return; }
      if (data.alreadyRegistered) { setAlreadyRegistered(true); return; }
      setRegistered(true);
    } catch {
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">

      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 p-8 md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.15),_transparent_60%)]" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500">
              <Clock className="h-3 w-3" /> Em breve
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> IA
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Split de músicas
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl">
            Separe qualquer música em faixas individuais — voz, baixo, bateria, guitarra e mais.
            Tudo com inteligência artificial, direto no LiderWeb.
          </p>
        </div>
      </div>

      {/* Features */}
      <div>
        <h2 className="text-xl font-bold mb-4">O que vai ser possível fazer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-border bg-muted/20 p-5">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Use cases */}
      <div className="rounded-xl border border-border bg-muted/20 p-6">
        <h2 className="text-base font-bold mb-4">Como seu ministério vai usar</h2>
        <ul className="space-y-2.5">
          {USECASES.map((uc, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
              {uc}
            </li>
          ))}
        </ul>
      </div>

      {/* Formulário de interesse */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8">
        {registered || alreadyRegistered ? (
          <div className="flex flex-col items-center gap-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <p className="text-lg font-bold">
                {alreadyRegistered ? "Você já está na lista!" : "Interesse registrado!"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {alreadyRegistered
                  ? "Já recebemos seu interesse. Você será o primeiro a saber quando lançar."
                  : "Avisaremos você por email assim que o Split de músicas estiver disponível."}
              </p>
            </div>
            {status === "unauthenticated" && (
              <Button variant="outline" size="sm" onClick={() => router.push("/login")}>
                Entrar na plataforma
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold">Quero ser avisado quando lançar</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cadastre seu email e seja o primeiro a ter acesso quando o Split de músicas for lançado.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              {status !== "authenticated" && (
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-9"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Seu melhor email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={loading || !email}
              >
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Registrando...</>
                  : <><Sparkles className="mr-2 h-4 w-4" />Quero ser avisado</>}
              </Button>
              <p className="text-xs text-muted-foreground">
                Sem spam. Só avisaremos quando o recurso estiver pronto.
              </p>
            </form>
          </>
        )}
      </div>

      {/* Acesso RBAC — info para admin */}
      {(user?.role === "ADMIN" || user?.role === "SUPERADMIN") && (
        <div className="rounded-xl border border-border/50 bg-muted/10 p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Info para administradores
          </p>
          <p className="text-sm text-muted-foreground">
            Quando o Split for lançado, o acesso será controlado por permissões RBAC.
            Membros com perfil <strong className="text-foreground">Músico</strong> ou <strong className="text-foreground">Ministro</strong> terão acesso automaticamente.
            Você também pode conceder acesso individualmente na gestão de membros.
          </p>
        </div>
      )}
    </div>
  );
}
