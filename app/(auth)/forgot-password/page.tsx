"use client";

import { useState } from "react";
import Link from "next/link";
import { Music, Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao enviar email"); return; }
      setSent(true);
    } catch {
      setError("Erro inesperado. Tente novamente.");
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
          <h1 className="text-2xl font-semibold">Esqueci minha senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {sent ? "Email enviado!" : "Digite seu email para receber o link de redefinição"}
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <div>
                <p className="font-semibold text-green-600 dark:text-green-400">Email enviado!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Se houver uma conta com o email <strong>{email}</strong>, você receberá um link para redefinir sua senha em breve.
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Não recebeu? Verifique sua caixa de spam ou tente novamente.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Seu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar link de redefinição"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar para o login
          </Link>
        </div>
      </Card>
    </div>
  );
}
