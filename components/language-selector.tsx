"use client";

import { useI18n, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";

const LANGUAGES: { locale: Locale; label: string; flag: string }[] = [
  { locale: "pt", label: "Português", flag: "🇧🇷" },
  { locale: "en", label: "English",   flag: "🇺🇸" },
  { locale: "es", label: "Español",   flag: "🇪🇸" },
];

interface LanguageSelectorProps {
  collapsed?: boolean; // modo sidebar recolhida
  variant?: "sidebar" | "header" | "settings";
}

export function LanguageSelector({ collapsed = false, variant = "header" }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.locale === locale) ?? LANGUAGES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (variant === "settings") {
    return (
      <div className="flex items-center gap-2">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.locale}
            onClick={() => setLocale(lang.locale)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              locale === lang.locale
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span>{lang.flag}</span>
            <span>{lang.label}</span>
            {locale === lang.locale && <Check className="h-3 w-3" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={t("language.selectLanguage")}
        className={cn(
          "flex items-center gap-1.5 rounded-lg transition-colors",
          variant === "sidebar"
            ? "w-full px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            : "h-9 px-2.5 border border-border bg-background text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Globe className="h-4 w-4 flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="text-sm">{current.flag}</span>
            {variant === "header" && (
              <>
                <span className="hidden sm:inline text-xs font-medium">{current.label}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </>
            )}
          </>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute z-50 mt-1 w-44 rounded-xl border border-border bg-popover p-1 shadow-xl",
          variant === "sidebar" ? "left-0 bottom-full mb-1" : "right-0 top-full"
        )}>
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("language.selectLanguage")}
          </p>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.locale}
              onClick={() => { setLocale(lang.locale); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                locale === lang.locale
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span className="text-base">{lang.flag}</span>
              <span className="flex-1 text-left">{lang.label}</span>
              {locale === lang.locale && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
