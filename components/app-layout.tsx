"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { AppHeader } from "@/components/app-header";
import { X } from "lucide-react";
import pkg from "../package.json";

const APP_VERSION = `Versão ${pkg.version}`;

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) setMobileMenuOpen(!mobileMenuOpen);
    else setCollapsed(!collapsed);
  };

  if (!mounted) {
    return (
      <div className="flex h-screen bg-background">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="h-16 border-b border-border bg-background" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
          <footer className="px-4 pb-4 text-center text-xs text-muted-foreground md:px-6">{APP_VERSION}</footer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {!isMobile && <Sidebar collapsed={collapsed} onToggle={toggleSidebar} isMobile={false} />}

      {isMobile && mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px]">
            <div className="relative h-full">
              <Sidebar collapsed={false} onToggle={() => {}} onMobileClose={() => setMobileMenuOpen(false)} isMobile />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute right-3 top-3 rounded-lg border border-border bg-card p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader onMenuClick={toggleSidebar} isMobile={isMobile} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        <footer className="px-4 pb-4 text-center text-xs text-muted-foreground md:px-6">{APP_VERSION}</footer>
      </div>
    </div>
  );
}
