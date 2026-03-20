"use client";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Music, Calendar, NotebookPen, CreditCard,
  Megaphone, MessageCircle, Cake, Building2, Shield, ChevronLeft,
  ChevronRight, Settings, TicketPercent, ClipboardList, Upload,
  GraduationCap, GraduationCap as ProfessorIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionUser } from "@/lib/types";
import { useBadges, markAsSeen } from "@/hooks/use-badges";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
  permissions?: string[];
  badge?: string;
  tag?: string;
}

interface MenuSection {
  label?: string;
  items: MenuItem[];
  roles?: string[];
}

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
  const musicCoachEnabled = (user as SessionUser | undefined)?.musicCoachEnabled;
  const badges = useBadges();

  const handleLinkClick = (href?: string) => () => {
    const SEEN_MAP: Record<string, string> = {
      "/songs": "musicas",
      "/chat-grupo": "chat",
      "/comunicados": "comunicados",
      "/ensaios": "ensaios",
      "/aniversariantes": "aniversariantes",
    };
    if (href) {
      const section = SEEN_MAP[href];
      if (section) markAsSeen(section);
    }
    if (isMobile && onMobileClose) onMobileClose();
  };

  const roleLabel =
    userRole === "SUPERADMIN" ? "Super Admin" :
    userRole === "ADMIN" ? "Administrador" :
    userRole === "LEADER" ? "Líder" : "Membro";

  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  const sections: MenuSection[] = [
    {
      items: [
        { label: "Início", href: "/dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN", "LEADER", "MEMBER"] },
      ],
    },
    {
      label: "Equipe",
      items: [
        { label: "Membros", href: "/members", icon: <Users className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER"], permissions: ["member.manage"] },
        { label: "Escalas", href: "/schedules", icon: <Calendar className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.escalas > 0 ? String(badges.escalas) : undefined },
        { label: "Ensaios", href: "/ensaios", icon: <NotebookPen className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.ensaios > 0 ? "!" : undefined },
        { label: "Chat do Grupo", href: "/chat-grupo", icon: <MessageCircle className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.chat > 0 ? String(badges.chat) : undefined },
        { label: "Aniversariantes", href: "/aniversariantes", icon: <Cake className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.aniversariantes > 0 ? String(badges.aniversariantes) : undefined },
      ],
    },
    {
      label: "Música",
      items: [
        { label: "Músicas", href: "/songs", icon: <Music className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.musicas > 0 ? String(badges.musicas) : undefined },
        ...(musicCoachEnabled ? [{ label: "Professor", href: "/professor", icon: <ProfessorIcon className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], tag: "IA" }] : []),
      ],
    },
    {
      label: "Comunicação",
      items: [
        { label: "Comunicados", href: "/comunicados", icon: <Megaphone className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.comunicados > 0 ? String(badges.comunicados) : undefined },
      ],
    },
    {
      label: "Gestão",
      items: [
        { label: "Administração", href: "/dashboard/admin", icon: <Shield className="h-[18px] w-[18px]" />, roles: ["ADMIN"], permissions: ["report.group.access"] },
        { label: "Meu Plano", href: "/meu-plano", icon: <CreditCard className="h-[18px] w-[18px]" />, roles: ["ADMIN"], permissions: ["subscription.manage"] },
        { label: "Config. Professor", href: "/professor-config", icon: <GraduationCap className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN"] },
        { label: "Importação CSV", href: "/importacao-csv", icon: <Upload className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN"] },
        { label: "Auditoria", href: "/auditoria", icon: <ClipboardList className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN"] },
        { label: "Grupos", href: "/admin", icon: <Building2 className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: "Cupons", href: "/cupons", icon: <TicketPercent className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: "Push / Comunicados", href: "/push-comunicados", icon: <Megaphone className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
      ],
    },
  ];

  const isItemVisible = (item: MenuItem) => {
    if (item.href === "/meu-plano" && userRole === "SUPERADMIN") return false;
    if (item.href === "/aniversariantes" && userRole === "SUPERADMIN") return false;
    if (["/ensaios", "/comunicados", "/chat-grupo"].includes(item.href) && !user?.groupId) return false;
    if (item.roles.includes(userRole)) return true;
    if (!item.permissions?.length) return false;
    return item.permissions.some((p) => userPermissions.includes(p));
  };

  const visibleSections = sections
    .map((section) => ({ ...section, items: section.items.filter(isItemVisible) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-[#0f1728] text-foreground transition-all duration-300", collapsed ? "w-[68px]" : "w-[260px]")}>
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-white/10 px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={handleLinkClick()}>
            <div className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-white/20 flex-shrink-0">
              <Image src="/favicon.svg" alt="Líder Web" fill className="object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white leading-tight">Líder Web</span>
              <span className="text-[10px] text-slate-500 leading-tight">by multitrackgospel.com</span>
            </div>
          </Link>
        ) : (
          <Link href="/dashboard" onClick={handleLinkClick()}>
            <div className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-white/20">
              <Image src="/favicon.svg" alt="Líder Web" fill className="object-contain" />
            </div>
          </Link>
        )}
        {!isMobile && !collapsed && (
          <button onClick={onToggle} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {!isMobile && collapsed && (
          <button onClick={onToggle} className="absolute right-[-12px] top-[18px] z-10 rounded-full border border-white/10 bg-[#0f1728] p-0.5 text-slate-400 hover:text-white shadow-sm">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : ""}>
            {section.label && !collapsed && (
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-slate-500">
                {section.label}
              </p>
            )}
            {section.label && collapsed && si > 0 && (
              <div className="mx-2 my-2 h-px bg-white/10" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={handleLinkClick(item.href)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all relative",
                        isActive
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-slate-400 hover:bg-white/8 hover:text-slate-100",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
                      )}
                      <span className={cn(isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-200")}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {item.tag && (
                            <span className="rounded-sm bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {item.tag}
                            </span>
                          )}
                          {item.badge && (
                            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white min-w-[18px] text-center">
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer — perfil */}
      <div className="border-t border-white/10 p-2">
        <Link
          href="/profile"
          onClick={handleLinkClick()}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-400 transition-all hover:bg-white/8 hover:text-slate-100",
            pathname === "/profile" && "bg-primary/20 text-primary",
            collapsed && "justify-center"
          )}
          title={collapsed ? "Perfil" : undefined}
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/30 text-[10px] font-semibold text-primary">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-slate-200">{user?.name ?? "Perfil"}</p>
              <p className="text-[10px] text-slate-500">{roleLabel}</p>
            </div>
          )}
          {!collapsed && <Settings className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />}
        </Link>
      </div>
    </aside>
  );
}
