"use client";

import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Sun, Moon, LogOut, ChevronDown, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface AppHeaderProps {
  onMenuClick: () => void;
  isMobile: boolean;
}

export function AppHeader({ onMenuClick, isMobile }: AppHeaderProps) {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSearch = () => {
    const term = search.trim();
    if (!term) {
      router.push("/songs");
      return;
    }

    router.push(`/songs?search=${encodeURIComponent(term)}`);
  };

  useEffect(() => {
    if (pathname !== "/songs") {
      setSearch("");
    }
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-border/80 bg-background/85 px-4 backdrop-blur md:px-6">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={onMenuClick} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="relative hidden w-[280px] lg:block">
            <button
              type="button"
              onClick={handleSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Pesquisar"
            >
              <Search className="h-4 w-4" />
            </button>
            <Input
              placeholder="Pesquisar músicas..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 hover:bg-accent"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {session?.user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">{session?.user?.name || "Usuário"}</span>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border bg-popover p-2 shadow-2xl">
                <div className="border-b border-border px-2 pb-2">
                  <p className="text-sm font-medium text-popover-foreground">{session?.user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
                </div>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push("/profile");
                  }}
                  className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <User className="h-4 w-4" />
                  Perfil
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
