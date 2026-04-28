"use client";

import { SessionProvider, signOut } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useState, useEffect, ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";

// Interceptar fetch global — detectar SESSION_REVOKED e fazer logout automático
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data?.code === "SESSION_REVOKED") {
          await signOut({ callbackUrl: "/login?reason=session_revoked" });
        }
      } catch {
        // ignorar erro de parse
      }
    }
    return response;
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SessionProvider>
      <I18nProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        {!mounted ? (
          <div style={{ visibility: "hidden" }}>{children}</div>
        ) : (
          children
        )}
      </ThemeProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
