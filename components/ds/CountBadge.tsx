import { cn } from "@/lib/cn";

/** Unread/count capsule (spec §5.3): `--action` fill, white badge text, "99+" past 99. */
export function CountBadge({
  count,
  max = 99,
  className,
  label,
}: {
  count: number;
  max?: number;
  className?: string;
  /** Accessible label, e.g. "3 unread". Defaults to the number. */
  label?: string;
}) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      className={cn(
        "type-badge tabular inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-action px-1.5 text-on-action",
        className,
      )}
      aria-label={label}
    >
      {text}
    </span>
  );
}
