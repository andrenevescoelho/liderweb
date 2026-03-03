import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";
  className?: string;
  title?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  danger: "bg-red-500/15 text-red-300 border border-red-500/20",
  info: "bg-primary/15 text-primary border border-primary/20",
  outline: "border border-border text-foreground bg-transparent",
};

export function Badge({ children, variant = "default", className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        variantClasses?.[variant ?? "default"] ?? variantClasses.default,
        className
      )}
    >
      {children}
    </span>
  );
}
