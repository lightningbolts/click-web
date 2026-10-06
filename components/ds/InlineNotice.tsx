import type { ReactNode } from "react";
import {
  CircleAlert,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type InlineNoticeVariant =
  "neutral" | "info" | "warning" | "destructive";

const VARIANT: Record<InlineNoticeVariant, { cls: string; icon: LucideIcon }> =
  {
    neutral: { cls: "bg-surface-raised text-fg-secondary", icon: Info },
    info: { cls: "bg-selection text-accent", icon: Info },
    warning: { cls: "bg-warning-fill text-warning-text", icon: TriangleAlert },
    destructive: {
      cls: "bg-destructive-fill text-destructive",
      icon: CircleAlert,
    },
  };

/** Icon + one line + optional action (spec §5.6): offline, E2EE device states, 48 h window. */
export function InlineNotice({
  variant = "neutral",
  icon,
  action,
  className,
  children,
  live,
}: {
  variant?: InlineNoticeVariant;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Announce politely when it appears. */
  live?: boolean;
}) {
  const v = VARIANT[variant];
  const Icon = icon ?? v.icon;
  return (
    <div
      role={live ? "status" : undefined}
      className={cn(
        "type-meta flex items-center gap-2 rounded-md px-3 py-2.5",
        v.cls,
        className,
      )}
    >
      <Icon size={16} strokeWidth={2} aria-hidden className="shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0 font-semibold">{action}</div> : null}
    </div>
  );
}
