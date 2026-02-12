"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useState, useEffect, ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {!mounted ? (
          <div style={{ visibility: "hidden" }}>{children}</div>
        ) : (
          children
        )}
      </ThemeProvider>
    </SessionProvider>
  );
}
