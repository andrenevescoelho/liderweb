"use client";

import { useEffect } from "react";

export function CapacitorPushRegister() {
  useEffect(() => {
    function registerPush() {
      const w = window as any;
      const Capacitor = w.Capacitor;

      if (!Capacitor?.isNativePlatform?.()) {
        console.log("[LiderWeb] Não está rodando no app nativo");
        return;
      }

      const PushNotifications = Capacitor?.Plugins?.PushNotifications;

      if (!PushNotifications) {
        console.warn("[LiderWeb] Plugin PushNotifications não disponível");
        return;
      }

      PushNotifications.requestPermissions()
        .then((permission: any) => {
          if (permission.receive !== "granted") {
            console.warn("[LiderWeb] Permissão de push negada");
            return null;
          }

          return PushNotifications.register();
        })
        .catch((err: any) => {
          console.error("[LiderWeb] Erro ao pedir permissão push:", err);
        });

      PushNotifications.addListener("registration", async (token: any) => {
        console.log("[LiderWeb] Push token:", token.value);

        await fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token: token.value,
            platform: "android",
          }),
        });
      });

      PushNotifications.addListener("registrationError", (err: any) => {
        console.error("[LiderWeb] Erro no registro push:", err);
      });
    }

    registerPush();
  }, []);

  return null;
}