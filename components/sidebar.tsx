"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  Music,
  Calendar,
  NotebookPen,
  CreditCard,
  Building2,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { SessionUser } from "@/lib/types";
import { PERMISSIONS, PERMISSION_PRESETS } from "@/lib/permissions";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  permissions?: string[];
}

const menuItems: MenuItem[] = [
  {
    label: "Início",
    href: "/dashboard",
    icon: <LayoutDashboard className="w-5 h-5" />,
    roles: ["SUPERADMIN", "ADMIN", "LEADER", "MEMBER"],
  },
  {
    label: "Administração",
    href: "/dashboard/admin",
    icon: <Shield className="w-5 h-5" />,
    roles: ["ADMIN"],
    permissions: ["report.group.access"],
  },
  {
    label: "Grupos",
    href: "/admin",
    icon: <Building2 className="w-5 h-5" />,
    roles: ["SUPERADMIN"],
  },
  {
    label: "Membros",
    href: "/members",
    icon: <Users className="w-5 h-5" />,
    roles: ["ADMIN", "LEADER"],
    permissions: ["member.manage"],
  },
  {
    label: "Músicas",
    href: "/songs",
    icon: <Music className="w-5 h-5" />,
    roles: ["ADMIN", "LEADER", "MEMBER"],
  },
  {
    label: "Escalas",
    href: "/schedules",
    icon: <Calendar className="w-5 h-5" />,
    roles: ["ADMIN", "LEADER", "MEMBER"],
  },
  {
    label: "Ensaios",
    href: "/ensaios",
    icon: <NotebookPen className="w-5 h-5" />,
    roles: ["ADMIN", "LEADER"],
    permissions: ["rehearsal.view"],
  },
  {
    label: "Meu Plano",
    href: "/meu-plano",
    icon: <CreditCard className="w-5 h-5" />,
    roles: ["ADMIN"],
    permissions: ["subscription.manage"],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMobileClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ collapsed, onToggle, onMobileClose, isMobile }: SidebarProps) {
  const { data: session } = useSession() || {};
  const pathname = usePathname();
  const user = session?.user as SessionUser | undefined;
  const userRole = user?.role || "";
  const userPermissions = user?.permissions ?? [];

  const permissionLabels = userPermissions
    .map((permissionKey) => PERMISSIONS.find((permission) => permission.key === permissionKey)?.label ?? permissionKey)
    .slice(0, 2);

  const presetScores = PERMISSION_PRESETS.map((preset) => {
    const matchedCount = preset.permissions.filter((permission) => userPermissions.includes(permission)).length;
    return {
      preset,
      matchedCount,
      missingCount: Math.max(preset.permissions.length - matchedCount, 0),
      extraCount: Math.max(userPermissions.length - matchedCount, 0),
    };
  });

  const bestPresetMatch = presetScores
    .filter((item) => item.matchedCount > 0)
    .sort((a, b) => {
      if (b.matchedCount !== a.matchedCount) return b.matchedCount - a.matchedCount;
      return a.missingCount - b.missingCount;
    })[0];

  const permissionPresetName = bestPresetMatch?.preset?.label
    ?.replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")
    ?.trim();

  const isPresetCustomized = Boolean(
    bestPresetMatch && (bestPresetMatch.missingCount > 0 || bestPresetMatch.extraCount > 0)
  );

  const hidePermissionSummary = pathname?.startsWith("/admin") || userRole === "ADMIN";

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.href === "/meu-plano" && userRole === "SUPERADMIN") {
      return false;
    }

    if (item.roles.includes(userRole)) {
      return true;
    }

    if (!item.permissions?.length) {
      return false;
    }

    return item.permissions.some((permission) => userPermissions.includes(permission));
  });

  const handleLinkClick = () => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-slate-900 text-white transition-all duration-300",
        collapsed ? "w-[70px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-slate-800",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-3" onClick={handleLinkClick}>
            <div className="relative w-8 h-8">
              <Image
                src="/logo.png"
                alt="Líder Web"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">Líder Web</span>
              <span className="text-[10px] text-slate-400 -mt-1">By Multitrack Gospel</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" onClick={handleLinkClick}>
            <div className="relative w-8 h-8">
              <Image
                src="/logo.png"
                alt="Líder Web"
                fill
                className="object-contain"
              />
            </div>
          </Link>
        )}
        {!isMobile && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            )}
          </button>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={handleLinkClick}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!collapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}        </ul>
      </nav>

      {/* Role Badge */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-800">
          <div className="px-3 py-2 rounded-lg bg-slate-800/50 space-y-1.5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-slate-300">
                {userRole === "SUPERADMIN" ? "Super Admin" :
                 userRole === "ADMIN" ? "Administrador" :
                 userRole === "LEADER" ? "Líder" : "Membro"}
              </span>
            </div>
            {!hidePermissionSummary && (
              <>
                {permissionPresetName ? (
                  <p className="text-xs text-slate-400">
                    Permissão: {permissionPresetName}
                    {isPresetCustomized ? " (customizada)" : ""}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">
                    RBAC: {userPermissions.length} permiss{userPermissions.length === 1 ? "ão" : "ões"}
                  </p>
                )}
                {!permissionPresetName && permissionLabels.length > 0 && (
                  <p className="text-xs text-slate-500 truncate" title={permissionLabels.join(", ")}>
                    {permissionLabels.join(" • ")}
                    {userPermissions.length > permissionLabels.length ? " • ..." : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
