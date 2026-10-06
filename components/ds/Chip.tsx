"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountBadge } from "./CountBadge";

type ChipProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  selected?: boolean;
  size?: "sm" | "md";
  icon?: LucideIcon;
  /** Shows a leading check when selected (FilterChip). */
  showCheck?: boolean;
  count?: number;
  children: ReactNode;
};

/** Selectable capsule (spec §5.2). Renders `aria-pressed` so it reads as a toggle. */
export function Chip({
  selected = false,
  size = "md",
  icon: Icon,
  showCheck,
  count,
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-40",
        size === "md"
          ? "h-9 text-[15px] leading-[22px]"
          : "h-[30px] text-[13px] leading-[18px]",
        selected
          ? "bg-selection text-accent"
          : "bg-fill-subtle text-fg hover:bg-fill-strong",
        className,
      )}
      {...rest}
    >
      {selected && showCheck ? (
        <Check size={14} strokeWidth={2.5} aria-hidden />
      ) : null}
      {Icon ? (
        <Icon size={size === "md" ? 16 : 14} strokeWidth={2} aria-hidden />
      ) : null}
      {children}
      {count ? <CountBadge count={count} /> : null}
    </button>
  );
}

/** Horizontal, scrollable row of chips with edge fades. */
export function ChipRow({
  className,
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "no-scrollbar -mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
