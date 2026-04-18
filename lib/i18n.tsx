"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Locale = "pt" | "en" | "es";

const COOKIE_NAME = "liderweb_locale";
const DEFAULT_LOCALE: Locale = "pt";
const SUPPORTED: Locale[] = ["pt", "en", "es"];

// Detectar locale do browser
function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("pt")) return "pt";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("en")) return "en";
  return DEFAULT_LOCALE;
}

// Ler cookie
function getStoredLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  const val = decodeURIComponent(match[1]) as Locale;
  return SUPPORTED.includes(val) ? val : null;
}

// Salvar cookie (1 ano)
function setStoredLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${COOKIE_NAME}=${locale}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

// Carregar mensagens
async function loadMessages(locale: Locale): Promise<Record<string, any>> {
  try {
    const msgs = await import(`@/messages/${locale}.json`);
    return msgs.default ?? msgs;
  } catch {
    // Fallback para PT
    const msgs = await import(`@/messages/pt.json`);
    return msgs.default ?? msgs;
  }
}

// Resolver caminho aninhado: "nav.home" → messages.nav.home
function resolvePath(obj: Record<string, any>, path: string): string {
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = current[part];
  }
  return typeof current === "string" ? current : path;
}

// Interpolar variáveis: "Olá, {name}!" + { name: "André" } → "Olá, André!"
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  loading: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
  loading: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Inicializar locale
  useEffect(() => {
    const stored = getStoredLocale();
    const initial = stored ?? detectBrowserLocale();
    setLocaleState(initial);
    loadMessages(initial).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLoading(true);
    setStoredLocale(newLocale);
    setLocaleState(newLocale);
    const msgs = await loadMessages(newLocale);
    setMessages(msgs);
    setLoading(false);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = resolvePath(messages, key);
      return interpolate(raw, vars);
    },
    [messages]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, loading }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
