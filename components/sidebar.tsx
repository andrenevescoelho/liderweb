"use client";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Music, Calendar, NotebookPen, CreditCard,
  Megaphone, MessageCircle, Cake, Building2, Shield, ChevronLeft,
  CircleHelp,
  ChevronRight, Settings, TicketPercent, ClipboardList, Upload,
  GraduationCap, GraduationCap as ProfessorIcon, Timer, Disc3, Grid3x3, Scissors, BarChart2, Sliders, LifeBuoy, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { LanguageSelector } from "@/components/language-selector";
import { SessionUser } from "@/lib/types";
import { useBadges, markAsSeen } from "@/hooks/use-badges";
import { useEntitlements } from "@/hooks/use-entitlements";

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
  const { t } = useI18n();
  const user = session?.user as SessionUser | undefined;
  const userRole = user?.role || "";
  const userPermissions = user?.permissions ?? [];
  const musicCoachEnabled = (user as SessionUser | undefined)?.musicCoachEnabled;
  const { entitlements } = useEntitlements();
  const planHasProfessor = entitlements.features.professor;
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
    userRole === "SUPERADMIN" ? t("nav.superAdmin") :
    userRole === "ADMIN" ? t("nav.administrator") :
    userRole === "LEADER" ? t("nav.leader") : t("nav.member");

  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  const sections: MenuSection[] = [
    {
      items: [
        { label: t("nav.home"), href: "/dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN", "LEADER", "MEMBER"] },
      ],
    },
    {
      label: t("nav.team"),
      items: [
        { label: t("nav.members"), href: "/members", icon: <Users className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER"], permissions: ["member.manage"] },
        { label: t("nav.schedules"), href: "/schedules", icon: <Calendar className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.escalas > 0 ? String(badges.escalas) : undefined },
        { label: t("nav.rehearsals"), href: "/ensaios", icon: <NotebookPen className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.ensaios > 0 ? "!" : undefined },
        { label: t("nav.groupChat"), href: "/chat-grupo", icon: <MessageCircle className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.chat > 0 ? String(badges.chat) : undefined },
        { label: t("nav.birthdays"), href: "/aniversariantes", icon: <Cake className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.aniversariantes > 0 ? String(badges.aniversariantes) : undefined },
      ],
    },
    {
      label: t("nav.music"),
      items: [
        { label: t("nav.songs"), href: "/songs", icon: <Music className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.musicas > 0 ? String(badges.musicas) : undefined },
        { label: t("nav.metronome"), href: "/metronomo", icon: <Timer className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"] },
        { label: t("nav.multitracks"), href: "/multitracks", icon: <Disc3 className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], permissions: ["multitrack.view"] },
        ...(musicCoachEnabled ? [{ label: t("nav.professor"), href: "/professor", icon: <ProfessorIcon className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"]}] : []),
        { label: t("nav.professorConfig"), href: "/professor-config", icon: <ProfessorIcon className="h-[18px] w-[18px]" />, roles: ["ADMIN", "MEMBER", "LEADER"], permissions: ["coach.config.manage"] },
        { label: t("nav.pads"), href: "/pads", icon: <Grid3x3 className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], permissions: ["pad.view"] },
        { label: t("nav.splits"), href: "/splits", icon: <Scissors className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], permissions: ["split.view"] },
        { label: t("nav.customMix"), href: "/custom-mix", icon: <Sliders className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], permissions: ["custom.mix.view"] },
      ],
    },
    {
      label: t("nav.communication"),
      items: [
        { label: t("nav.announcements"), href: "/comunicados", icon: <Megaphone className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER"], badge: badges.comunicados > 0 ? String(badges.comunicados) : undefined },
        { label: t("nav.faq"), href: "/faq", icon: <CircleHelp className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER", "SUPERADMIN"] },
        { label: t("nav.support"), href: "/dashboard/suporte", icon: <LifeBuoy className="h-[18px] w-[18px]" />, roles: ["ADMIN", "LEADER", "MEMBER", "SUPERADMIN"], badge: badges.tickets > 0 ? String(badges.tickets) : undefined },
      ],
    },
    {
      label: t("nav.management"),
      items: [
        { label: t("nav.administration"), href: "/dashboard/admin", icon: <Shield className="h-[18px] w-[18px]" />, roles: ["ADMIN"], permissions: ["report.group.access"] },
        { label: t("nav.musicalAnalytics"), href: "/dashboard/analytics-musicais", icon: <BarChart2 className="h-[18px] w-[18px]" />, roles: ["ADMIN", "SUPERADMIN", "MEMBER", "LEADER"], permissions: ["report.group.access"] },
        { label: t("nav.myPlan"), href: "/meu-plano", icon: <CreditCard className="h-[18px] w-[18px]" />, roles: ["ADMIN"], permissions: ["subscription.manage"] },
        { label: t("nav.multitracksAdmin"), href: "/multitracks-admin", icon: <Disc3 className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.splitAdmin"), href: "/split-admin", icon: <Scissors className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.customMixAdmin"), href: "/custom-mix-admin", icon: <Sliders className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.padsAdmin"), href: "/pads-admin", icon: <Grid3x3 className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.csvImport"), href: "/importacao-csv", icon: <Upload className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN", "MEMBER", "LEADER"], permissions: ["member.manage"] },
        { label: t("nav.audit"), href: "/auditoria", icon: <ClipboardList className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN", "ADMIN", "MEMBER", "LEADER"], permissions: ["report.group.access"] },
        { label: t("nav.groups"), href: "/admin?tab=groups", icon: <Building2 className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.members"), href: "/admin?tab=users", icon: <Users className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.subscriptions"), href: "/admin?tab=subscriptions", icon: <CreditCard className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.coupons"), href: "/cupons", icon: <TicketPercent className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.billingPlans"), href: "/billing-admin", icon: <CreditCard className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
        { label: t("nav.attendance"), href: "/support-admin", icon: <Headphones className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"], badge: badges.tickets > 0 ? String(badges.tickets) : undefined },
        { label: t("nav.singleProducts"), href: "/products-admin", icon: <CreditCard className="h-[18px] w-[18px]" />, roles: ["SUPERADMIN"] },
      ],
    },
  ];

  const isItemVisible = (item: MenuItem) => {
    if (item.href === "/meu-plano" && userRole === "SUPERADMIN") return false;
    if (item.href === "/aniversariantes" && userRole === "SUPERADMIN") return false;
    if (["/ensaios", "/comunicados", "/chat-grupo"].includes(item.href) && !user?.groupId) return false;

    // Verificar se o role tem acesso ao item
    if (!item.roles.includes(userRole)) return false;

    // SUPERADMIN: só o que está explicitamente no seu roles[] — sem herdar permissões granulares
    if (userRole === "SUPERADMIN") return true;

    // Se o item tem permissões granulares:
    // a permissão sozinha é suficiente — não exige role específico
    if (item.permissions?.length) {
      // ADMIN sempre tem acesso se está no roles do item
      if (userRole === "ADMIN" && item.roles.includes("ADMIN")) return true;
      // Qualquer role: verifica se tem ao menos uma das permissões
      return item.permissions.some((p) => userPermissions.includes(p));
    }

    // Sem permissions: controle puramente por role
    return item.roles.includes(userRole);
  };

  const visibleSections = sections
    .map((section) => ({ ...section, items: section.items.filter(isItemVisible) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-card text-foreground transition-all duration-300", collapsed ? "w-[68px]" : "w-[260px]")}>
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-white/10 px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={handleLinkClick()}>
            <div className="relative h-7 w-7 overflow-hidden rounded-md ring-1 ring-white/20 flex-shrink-0">
              <Image src="/favicon.svg" alt="Líder Web" fill className="object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground leading-tight">Líder Web</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{t("nav.byMinistry")}</span>
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
          <button onClick={onToggle} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {!isMobile && collapsed && (
          <button onClick={onToggle} className="absolute right-[-12px] top-[18px] z-10 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground shadow-sm">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-4" : ""}>
            {section.label && !collapsed && (
              <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
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
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
                      )}
                      <span className={cn(isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>
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
        <div className="px-2 pb-1">
          <LanguageSelector variant="sidebar" collapsed={collapsed} />
        </div>
        <Link
          href="/profile"
          onClick={handleLinkClick()}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
            pathname === "/profile" && "bg-primary/20 text-primary",
            collapsed && "justify-center"
          )}
          title={collapsed ? "Perfil" : undefined}
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full overflow-hidden bg-primary/30 text-[10px] font-semibold text-primary flex-shrink-0">
            {(user as any)?.avatarUrl
              ? <img src={(user as any).avatarUrl} alt={user?.name ?? ""} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              : initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">{user?.name ?? "Perfil"}</p>
              <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
            </div>
          )}
          {!collapsed && <Settings className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
        </Link>
      </div>
    </aside>
  );
}
