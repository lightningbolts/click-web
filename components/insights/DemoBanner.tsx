"use client";

import { FcCard } from "@/components/fc";

/**
 * Demo mode notice — opaque bordered plate (Functional Clarity).
 */
export function DemoBanner({ onTurnOff }: { onTurnOff?: () => void }) {
  return (
    <FcCard className="flex flex-col gap-3 border-2 border-border-hard bg-surface px-4 py-3 text-sm text-on-surface sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-primary">Demo data is on</p>
        <p className="mt-1 font-medium leading-relaxed text-on-surface-variant">
          Empty insights are filled with sample numbers so you can explore the
          dashboard. Turn this off to see live venue data only.
        </p>
      </div>
      {onTurnOff ? (
        <button
          type="button"
          onClick={onTurnOff}
          className="fc-btn-secondary shrink-0 self-start px-3 py-2 text-xs"
        >
          Turn off demo
        </button>
      ) : null}
    </FcCard>
  );
}
