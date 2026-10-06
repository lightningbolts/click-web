import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

const base =
  "block rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]";
const interactiveCls =
  "transition-colors duration-[var(--d-fast)] hover:bg-[color-mix(in_srgb,var(--surface)_94%,var(--text)_6%)] active:bg-[color-mix(in_srgb,var(--surface)_90%,var(--text)_10%)]";

export function cardClassName({
  compact,
  interactive,
  className,
}: { compact?: boolean; interactive?: boolean; className?: string } = {}) {
  return cn(
    base,
    compact ? "p-4" : "p-5",
    interactive && interactiveCls,
    className,
  );
}

type CardProps = ComponentPropsWithoutRef<"div"> & {
  compact?: boolean;
  interactive?: boolean;
  as?: "div" | "section" | "article";
};

/** Surface on the page by tone alone: no border, no shadow, never lifts (spec §5.4). */
export function Card({
  compact,
  interactive,
  as: Tag = "div",
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cardClassName({ compact, interactive, className })}
      {...rest}
    />
  );
}

/** A whole-card link. */
export function CardLink({
  compact,
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & { compact?: boolean }) {
  return (
    <Link
      className={cardClassName({ compact, interactive: true, className })}
      {...rest}
    />
  );
}
