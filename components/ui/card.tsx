import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  id?: string;
}

export function Card({ children, className, onClick, id }: CardProps) {
  return (
    <div
      id={id}
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/80 bg-card text-card-foreground shadow-[0_12px_32px_-24px_rgba(0,0,0,0.9)] transition-all duration-200",
        onClick && "cursor-pointer hover:border-primary/30 hover:shadow-[0_16px_40px_-26px_rgba(13,148,136,0.5)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 px-6 pt-6", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-base font-semibold tracking-tight text-card-foreground", className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 pb-6 text-sm text-muted-foreground", className)}>{children}</div>;
}
