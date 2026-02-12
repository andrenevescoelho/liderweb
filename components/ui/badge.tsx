import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "secondary";
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  secondary: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  info: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantClasses?.[variant ?? "default"] ?? variantClasses["default"],
        className
      )}
    >
      {children}
    </span>
  );
}
