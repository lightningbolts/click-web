import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Day-grouped timeline (spec §5.7): a sticky day header (glass while stuck) and, from
 * 640 px, a dashed left rail with a dot per day.
 */
export function Timeline({
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
      className={cn("relative", className)}
      aria-label={label}
      role={label ? "region" : undefined}
    >
      <span
        aria-hidden
        className="absolute bottom-0 left-[3.5px] top-3 hidden border-l border-dashed border-hairline sm:block"
      />
      {children}
    </div>
  );
}

export function TimelineDay({
  title,
  subtitle,
  children,
  id,
}: {
  /** "Today", "Tomorrow", "Oct 9". */
  title: ReactNode;
  /** Weekday, e.g. "Monday". */
  subtitle?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="relative pb-8 sm:pl-7">
      <div className="material-glass sticky top-[var(--topbar-height)] z-10 -mx-[var(--gutter)] px-[var(--gutter)] py-2 sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        <span
          aria-hidden
          className="absolute -left-7 top-1/2 hidden size-2 -translate-y-1/2 rounded-full bg-fg-tertiary sm:block"
        />
        <h2 id={id} className="flex items-baseline gap-2">
          <span className="type-headline text-fg">{title}</span>
          {subtitle ? (
            <span className="type-body text-fg-tertiary">{subtitle}</span>
          ) : null}
        </h2>
      </div>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </section>
  );
}
