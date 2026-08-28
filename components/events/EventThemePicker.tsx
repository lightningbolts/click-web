"use client";

import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { cn } from "@/lib/cn";
import { EVENT_COVER_THEME_IDS } from "@/lib/events/eventOptions";

export default function EventThemePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-on-surface">Theme</p>
      <div className="grid grid-cols-5 gap-2" data-testid="event-theme-picker">
        {EVENT_COVER_THEME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-label={id.replace("theme:", "")}
            onClick={() => onChange(id)}
            className={cn(
              "overflow-hidden rounded-[12px] border-2",
              value === id ? "border-primary" : "border-transparent hover:border-border-hard",
            )}
          >
            <CardVisualHero id={id} visualSeed={id} className="h-12 w-full" />
          </button>
        ))}
      </div>
    </div>
  );
}
