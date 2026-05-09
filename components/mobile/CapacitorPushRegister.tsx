"use client";

import { useEffect } from "react";

export function CapacitorPushRegister() {
  useEffect(() => {
    async function registerPush() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        const { PushNotifications } = await import("@capacitor/push-notifications");

        if (!Capacitor.isNativePlatform()) return;

        const permission = await PushNotifications.requestPermissions();

        if (permission.receive !== "granted") {
          console.warn("[LiderWeb] Push negado pelo usuário");
          return;
        }

        await PushNotifications.register();

        await PushNotifications.addListener("registration", async (token) => {
          console.log("[LiderWeb] Push token:", token.value);

          await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              token: token.value,
              platform: Capacitor.getPlatform(),
            }),
          });
        });

        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[LiderWeb] Erro no push:", err);
        });
      } catch (err) {
        console.warn("[LiderWeb] Push não disponível:", err);
      }
    }

    registerPush();
  }, []);

  return null;
}