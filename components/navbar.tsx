"use client";

import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Music,
  Users,
  ListMusic,
  Calendar,
  LayoutDashboard,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Building2,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPERADMIN", "ADMIN", "LEADER", "MEMBER"] },
  { href: "/admin", label: "Grupos", icon: Building2,
  CreditCard, roles: ["SUPERADMIN"] },
  { href: "/members", label: "Membros", icon: Users, roles: ["ADMIN", "LEADER"] },
  { href: "/meu-plano", label: "Meu Plano", icon: CreditCard, roles: ["ADMIN", "SUPERADMIN"] },
  { href: "/songs", label: "Músicas", icon: Music, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { href: "/setlists", label: "Repertórios", icon: ListMusic, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { href: "/schedules", label: "Escalas", icon: Calendar, roles: ["ADMIN", "LEADER", "MEMBER"] },
];

export function Navbar() {
  const { data: session } = useSession() || {};
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const userRole = (session?.user as any)?.role ?? "MEMBER";

  const filteredNav = navItems?.filter((item) => item?.roles?.includes(userRole)) ?? [];

  if (!session) return null;

  return (
    <>
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Music className="w-8 h-8 text-purple-600" />
              <span className="font-bold text-xl hidden sm:block dark:text-white">Worship Manager</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {filteredNav?.map((item) => {
                const Icon = item?.icon;
                return (
                  <Link
                    key={item?.href ?? ''}
                    href={item?.href ?? ''}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      pathname === item?.href
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    {item?.label ?? ''}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {theme === "dark" ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>

              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-white dark:bg-gray-900 pt-16">
          <div className="p-4 space-y-2">
            {filteredNav?.map((item) => {
              const Icon = item?.icon;
              return (
                <Link
                  key={item?.href ?? ''}
                  href={item?.href ?? ''}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all",
                    pathname === item?.href
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  )}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                  {item?.label ?? ''}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
