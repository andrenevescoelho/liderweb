"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { AppHeader } from "@/components/app-header";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

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
    if (isMobile) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  // Evitar hydration mismatch - renderizar layout básico no SSR
  if (!mounted) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-slate-950">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="h-16 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
          <footer className="px-4 md:px-6 pb-4 text-center text-xs text-gray-500 dark:text-gray-400">
            Versão {APP_VERSION}
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sidebar
          collapsed={collapsed}
          onToggle={toggleSidebar}
          isMobile={false}
        />
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 w-[260px]">
            <div className="relative h-full">
              <Sidebar
                collapsed={false}
                onToggle={() => {}}
                onMobileClose={() => setMobileMenuOpen(false)}
                isMobile={true}
              />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppHeader
          onMenuClick={toggleSidebar}
          isMobile={isMobile}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
        <footer className="px-4 md:px-6 pb-4 text-center text-xs text-gray-500 dark:text-gray-400">
          Versão {APP_VERSION}
        </footer>
      </div>
    </div>
  );
}
