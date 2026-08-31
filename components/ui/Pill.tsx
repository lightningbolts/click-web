"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type PillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> & {
  selected?: boolean;
  "aria-pressed"?: boolean;
};

export function Pill({
  selected = false,
  children,
  onClick,
  type = "button",
  disabled,
  className,
  "aria-pressed": ariaPressed,
  role,
  ...buttonProps
}: PillProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      role={role}
      aria-pressed={role === "tab" ? undefined : (ariaPressed ?? selected)}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-primary text-on-primary"
          : "border-border-hard bg-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
        className,
      )}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
