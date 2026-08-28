"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type InfoRowProps = {
  title: string;
  description?: string;
  tooltip?: string;
  children?: React.ReactNode;
  className?: string;
};

export function InfoRow({ title, description, tooltip, children, className }: InfoRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-on-surface">{title}</span>
          {tooltip ? (
            <span className="group relative inline-flex">
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`More about ${title}`}
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-[12px] border border-border-hard bg-surface px-3 py-2 text-xs font-normal leading-snug text-on-surface shadow-lg group-hover:block group-focus-within:block"
              >
                {tooltip}
              </span>
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-1 text-xs text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
