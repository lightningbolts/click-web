import { cn } from "@/lib/cn";

/** 44×48 month/day tile (spec §5.3). Pass the date already in the viewer's/event's zone. */
export function DateTile({
  month,
  day,
  className,
}: {
  /** Short month, e.g. "Oct". */
  month: string;
  day: string | number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-raised",
        className,
      )}
    >
      <span className="type-badge uppercase text-fg-tertiary">{month}</span>
      <span className="type-headline tabular -mt-0.5 text-fg">{day}</span>
    </span>
  );
}

/** Month/day parts for a date in an IANA zone (defaults to the runtime zone). */
export function dateTileParts(
  date: Date,
  timeZone?: string,
): { month: string; day: string } {
  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone,
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone,
  }).format(date);
  return { month, day };
}
