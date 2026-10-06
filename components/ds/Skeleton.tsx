import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

const ROUNDED = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
  pill: "rounded-pill",
} as const;

/**
 * Placeholder with the **exact final dimensions** (spec §5.6). Shimmer only on shapes
 * 64 px or taller; rows stay static.
 */
export function Skeleton({
  className,
  style,
  shimmer,
  rounded = "md",
}: {
  className?: string;
  style?: CSSProperties;
  shimmer?: boolean;
  rounded?: keyof typeof ROUNDED;
}) {
  return (
    <span
      aria-hidden
      data-shimmer={shimmer ? "true" : undefined}
      className={cn("ds-skeleton block", ROUNDED[rounded], className)}
      style={style}
    />
  );
}

/** Text-line placeholder at a type role's line height. */
export function SkeletonText({
  lines = 1,
  className,
  lastWidth = "60%",
}: {
  lines?: number;
  className?: string;
  lastWidth?: string;
}) {
  return (
    <span className={cn("flex flex-col gap-1.5", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          rounded="sm"
          className="h-3.5"
          style={{ width: i === lines - 1 && lines > 1 ? lastWidth : "100%" }}
        />
      ))}
    </span>
  );
}
