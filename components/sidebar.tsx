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
  Megaphone,
  MessageCircle,
  Cake,
  Building2,
  Shield,
  ChevronLeft,
  ChevronRight,
  Settings,
  TicketPercent,
  ClipboardList,
  Upload,
  GraduationCap,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  { label: "Início", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" />, roles: ["SUPERADMIN", "ADMIN", "LEADER", "MEMBER"] },
  { label: "Administração", href: "/dashboard/admin", icon: <Shield className="h-5 w-5" />, roles: ["ADMIN"], permissions: ["report.group.access"] },
  { label: "Grupos", href: "/admin", icon: <Building2 className="h-5 w-5" />, roles: ["SUPERADMIN"] },
  { label: "Cupons", href: "/cupons", icon: <TicketPercent className="h-5 w-5" />, roles: ["SUPERADMIN"], permissions: ["manage_coupons", "view_coupons"] },
  { label: "Membros", href: "/members", icon: <Users className="h-5 w-5" />, roles: ["ADMIN", "LEADER"], permissions: ["member.manage"] },
  { label: "Músicas", href: "/songs", icon: <Music className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Aniversariantes", href: "/aniversariantes", icon: <Cake className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Escalas", href: "/schedules", icon: <Calendar className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Ensaios", href: "/ensaios", icon: <NotebookPen className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Comunicados", href: "/comunicados", icon: <Megaphone className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Chat do Grupo", href: "/chat-grupo", icon: <MessageCircle className="h-5 w-5" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
  { label: "Meu Plano", href: "/meu-plano", icon: <CreditCard className="h-5 w-5" />, roles: ["ADMIN"], permissions: ["subscription.manage"] },
  { label: "Importação CSV", href: "/importacao-csv", icon: <Upload className="h-5 w-5" />, roles: ["SUPERADMIN", "ADMIN"] },
  { label: "Auditoria", href: "/auditoria", icon: <ClipboardList className="h-5 w-5" />, roles: ["SUPERADMIN", "ADMIN"] },
  { label: "Push / Comunicados", href: "/push-comunicados", icon: <Megaphone className="h-5 w-5" />, roles: ["SUPERADMIN"] },
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

  const permissionPresetName = bestPresetMatch?.preset?.label?.replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")?.trim();
  const isPresetCustomized = Boolean(bestPresetMatch && (bestPresetMatch.missingCount > 0 || bestPresetMatch.extraCount > 0));
  const hidePermissionSummary = pathname?.startsWith("/admin") || userRole === "ADMIN";

  const dynamicItems: MenuItem[] = [...menuItems];

  dynamicItems.splice(9, 0, {
    label: "Config. Professor",
    href: "/professor-config",
    icon: <GraduationCap className="h-5 w-5" />,
    roles: ["SUPERADMIN", "ADMIN"],
  });

  const musicCoachEnabled = (user as SessionUser | undefined)?.musicCoachEnabled;
  if (musicCoachEnabled) {
    dynamicItems.splice(10, 0, {
      label: "Professor",
      href: "/professor",
      icon: <GraduationCap className="h-5 w-5" />,
      roles: ["ADMIN", "LEADER", "MEMBER"],
    });
  }

  const filteredMenuItems = dynamicItems.filter((item) => {
    if (item.href === "/meu-plano" && userRole === "SUPERADMIN") return false;
    if (item.href === "/aniversariantes" && userRole === "SUPERADMIN") return false;
    if (["/ensaios", "/comunicados", "/chat-grupo"].includes(item.href) && !user?.groupId) return false;
    if (item.roles.includes(userRole)) return true;
    if (!item.permissions?.length) return false;
    return item.permissions.some((permission) => userPermissions.includes(permission));
  });

  const handleLinkClick = () => {
    if (isMobile && onMobileClose) onMobileClose();
  };

  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-[#0f1728] text-foreground transition-all duration-300", collapsed ? "w-[78px]" : "w-[272px]")}>
      <div className={cn("flex h-16 items-center border-b border-white/10 px-4", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-3" onClick={handleLinkClick}>
            <div className="relative h-8 w-8 overflow-hidden rounded-md ring-1 ring-white/20">
              <Image src="/favicon.svg" alt="Líder Web" fill className="object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold text-white">Líder Web</span>
              <span className="-mt-0.5 text-[10px] text-slate-400">by multitrackgospel.com</span>
            </div>
          </Link>
        ) : (
          <Link href="/dashboard" onClick={handleLinkClick}>
            <div className="relative h-8 w-8 overflow-hidden rounded-md ring-1 ring-white/20">
              <Image src="/favicon.svg" alt="Líder Web" fill className="object-contain" />
            </div>
          </Link>
        )}

        {!isMobile && (
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={handleLinkClick}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                    isActive ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_rgba(20,184,166,0.95)]" : "text-slate-300 hover:bg-white/10 hover:text-white",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon}
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn("border-t border-white/10 p-3", collapsed ? "px-2" : "px-4")}>
        <Link
          href="/profile"
          onClick={handleLinkClick}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition-all hover:bg-white/10 hover:text-white",
            pathname === "/profile" && "bg-primary text-primary-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Perfil" : undefined}
        >
          <Settings className="h-5 w-5" />
          {!collapsed && <span className="font-medium">Perfil</span>}
        </Link>
      </div>

      {!collapsed && (
        <div className="border-t border-white/10 p-4">
          <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm text-slate-200">
                {userRole === "SUPERADMIN" ? "Super Admin" : userRole === "ADMIN" ? "Administrador" : userRole === "LEADER" ? "Líder" : "Membro"}
              </span>
            </div>
            {!hidePermissionSummary && (
              <>
                {permissionPresetName ? (
                  <p className="text-xs text-slate-400">Permissão: {permissionPresetName}{isPresetCustomized ? " (customizada)" : ""}</p>
                ) : (
                  <p className="text-xs text-slate-400">RBAC: {userPermissions.length} permiss{userPermissions.length === 1 ? "ão" : "ões"}</p>
                )}
                {!permissionPresetName && permissionLabels.length > 0 && (
                  <p className="truncate text-xs text-slate-500" title={permissionLabels.join(", ")}>
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
