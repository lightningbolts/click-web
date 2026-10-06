import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type StatusPillVariant =
  | "live"
  | "tinted"
  | "neutral"
  | "warning"
  | "success"
  | "destructive"
  | "on-media";

const VARIANT: Record<StatusPillVariant, string> = {
  live: "bg-live text-white",
  tinted: "bg-selection text-accent",
  neutral: "bg-fill-subtle text-fg-secondary",
  warning: "bg-warning-fill text-warning-text",
  success:
    "bg-[color-mix(in_srgb,var(--online)_14%,transparent)] text-online-text",
  destructive: "bg-destructive-fill text-destructive",
  "on-media": "material-glass-dark",
};

/** 24 px status capsule (spec §5.3). Live always says "LIVE" in text, never color alone. */
export function StatusPill({
  variant = "neutral",
  icon: Icon,
  className,
  children,
}: {
  variant?: StatusPillVariant;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "type-badge inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-2.5",
        VARIANT[variant],
        className,
      )}
    >
      {variant === "live" ? (
        <span aria-hidden className="size-1.5 rounded-full bg-white" />
      ) : null}
      {Icon ? <Icon size={12} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}
