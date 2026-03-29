"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Music, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (newPassword.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao redefinir senha"); return; }
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 3000);
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
          <h1 className="text-2xl font-semibold">Nova senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {success ? "Senha redefinida com sucesso!" : "Digite sua nova senha"}
          </p>
        </div>

        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-destructive">Link inválido ou expirado.</p>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Solicitar novo link
            </Link>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400">Senha redefinida!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Redirecionando para o login...
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Nova senha (mínimo 8 caracteres)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-10"
                required
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pl-10"
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !newPassword || !confirm}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Redefinir senha"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Voltar para o login
          </Link>
        </div>
      </Card>
    </div>
  );
}
