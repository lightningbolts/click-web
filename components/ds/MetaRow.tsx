import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Icon-or-date tile + two lines (spec §5.3), used for When / Where on event and Place
 * pages. `leading` overrides the icon tile (e.g. a DateTile).
 */
export function MetaRow({
  icon: Icon,
  leading,
  title,
  subtitle,
  trailing,
  className,
}: {
  icon?: LucideIcon;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {leading ??
        (Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-raised text-fg-secondary">
            <Icon size={20} strokeWidth={1.75} aria-hidden />
          </span>
        ) : null)}
      <div className="min-w-0 flex-1">
        <div className="type-body-strong truncate text-fg">{title}</div>
        {subtitle ? (
          <div className="type-meta truncate text-fg-tertiary">{subtitle}</div>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
