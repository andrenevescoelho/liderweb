"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Users, Mail, ArrowRight, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SemGrupoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as any;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
    // Se tiver grupo, redirecionar
    if (status === "authenticated" && (user?.groupId || user?.role === "SUPERADMIN")) {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg space-y-6">
          {/* Ícone */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Users className="h-8 w-8 text-orange-500" />
            </div>
          </div>

          {/* Texto */}
          <div className="text-center space-y-2">
            <h1 className="text-xl font-bold">Você não está em nenhum grupo</h1>
            <p className="text-sm text-muted-foreground">
              Sua conta <span className="font-medium text-foreground">{user?.email}</span> foi autenticada, mas não está vinculada a nenhum ministério.
            </p>
          </div>

          {/* Opções */}
          <div className="space-y-3">
            {/* Opção 1: Aguardar convite */}
            <div className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Mail className="h-4 w-4 text-blue-500" />
                Já faço parte de um ministério
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Peça ao seu líder para enviar um convite para <strong>{user?.email}</strong>. Você receberá um link por email para entrar no grupo.
              </p>
            </div>

            {/* Opção 2: Criar novo grupo */}
            <div className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Plus className="h-4 w-4 text-green-500" />
                Quero cadastrar meu ministério
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Crie um novo grupo e convide sua equipe para usar o Líder Web.
              </p>
              <div className="pl-6">
                <Button
                  size="sm"
                  onClick={() => router.push("/signup?mode=new-group")}
                  className="gap-1.5"
                >
                  Cadastrar ministério
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Sair */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Conta errada?
            </p>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair e trocar conta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
