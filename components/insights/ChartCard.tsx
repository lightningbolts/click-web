"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cardClassName } from "@/components/ds/Card";
import { Tooltip } from "@/components/ds/Tooltip";

/**
 * Every Insights chart sits in one of these (spec §9.5): title in headline, "n = … · range" in
 * meta tertiary, and a one-sentence info tooltip.
 */
export function ChartCard({
  title,
  subtitle,
  info,
  action,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  info?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={`${title}, ${subtitle}`} className={cardClassName({ className: `flex flex-col gap-4 ${className ?? ""}` })}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="type-headline flex items-center gap-1.5 text-fg">
            {title}
            {info ? (
              <Tooltip content={info}>
                <button type="button" aria-label={`About ${title}`} className="text-fg-tertiary hover:text-fg-secondary">
                  <Info size={14} aria-hidden />
                </button>
              </Tooltip>
            ) : null}
          </h3>
          <p className="type-meta tabular text-fg-tertiary">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Instead of empty charts or zeros (spec §9.5 thresholds). */
export function NotEnoughData({ n, unit }: { n: number; unit: string }) {
  return (
    <p className="type-body rounded-md bg-fill-subtle px-4 py-6 text-center text-fg-secondary">
      Not enough data yet · n = {n} {unit}
    </p>
  );
}
