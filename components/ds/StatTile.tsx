import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { StatusPill } from "./StatusPill";

/**
 * Metric tile (spec §5.3). `value` must be a real number: never pass 0 for a failed load,
 * render a RetryRow instead. `n` is shown when given ("Every chart states its n").
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** e.g. "+12%" with tone. */
  delta?: { text: string; tone: "up" | "down" | "flat" };
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface p-4 dark:shadow-[inset_0_0_0_1px_var(--hairline)]",
        className,
      )}
    >
      <div className="type-meta text-fg-tertiary">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="type-title-3 tabular text-fg">{value}</span>
        {delta ? (
          <StatusPill
            variant={
              delta.tone === "up"
                ? "success"
                : delta.tone === "down"
                  ? "warning"
                  : "neutral"
            }
          >
            {delta.text}
          </StatusPill>
        ) : null}
      </div>
      {hint ? (
        <div className="type-meta mt-1 text-fg-tertiary">{hint}</div>
      ) : null}
    </div>
  );
}
