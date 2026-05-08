"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

export function CapacitorSessionRestore() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Registrar push token quando usuário está autenticado
  useEffect(() => {
    if (status !== "authenticated") return;
    // @ts-ignore
    if (!window.Capacitor?.isNativePlatform?.()) return;

    const registerPush = async () => {
      try {
        // @ts-ignore
        const { PushNotifications } = window.Capacitor.Plugins;
        if (!PushNotifications) return;

        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token: any) => {
          console.log("[LW] Push token obtido:", token.value?.substring(0, 20));
          // Salvar no servidor
          await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              token: token.value,
              platform: "android",
            }),
          }).catch(() => {});
        });

        // Ao tocar na notificação
        PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
          const url = action.notification.data?.url;
          if (url) router.push(url);
        });

      } catch (err) {
        console.error("[LW] Erro ao registrar push:", err);
      }
    };

    registerPush();
  }, [status, router]);

  // Restaurar sessão se não autenticado
  useEffect(() => {
    // @ts-ignore
    if (!window.Capacitor?.isNativePlatform?.()) return;
    if (status === "loading") return;
    if (status === "authenticated") return;
    if (pathname?.startsWith("/login") || pathname?.startsWith("/signup")) return;

    const tryRestore = async () => {
      try {
        const { restoreSession } = await import("@/lib/capacitor-native");
        const restored = await restoreSession();
        if (restored) {
          window.location.reload();
        } else {
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
