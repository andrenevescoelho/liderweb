"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

// Componente que restaura sessão no app Capacitor
// Adicionar no layout principal do app
export function CapacitorSessionRestore() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Só roda no app nativo
    // @ts-ignore
    if (!window.Capacitor?.isNativePlatform?.()) return;
    // Só tenta restaurar se não há sessão e não está na tela de login
    if (status === "loading") return;
    if (status === "authenticated") return;
    if (pathname?.startsWith("/login") || pathname?.startsWith("/signup")) return;

    const tryRestore = async () => {
      try {
        const { restoreSession } = await import("@/lib/capacitor-native");
        const restored = await restoreSession();
        if (restored) {
          // Forçar reload para pegar a sessão restaurada
          window.location.reload();
        } else {
          // Sem sessão — ir para login
          router.replace("/login");
        }
      } catch {
        router.replace("/login");
      }
    };

    tryRestore();
  }, [status, pathname, router]);

  return null;
}
