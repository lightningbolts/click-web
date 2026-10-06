"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Segment<T extends string> = {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
};

/**
 * Capsule segmented control (spec §5.2): `--fill-subtle` track, raised thumb that slides
 * over `--d-base`. A radiogroup with roving focus (arrow keys move + select).
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  size = "md",
  fullWidth,
  className,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + segments.length) % segments.length;
    onChange(segments[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "relative isolate inline-grid rounded-pill bg-fill-subtle p-[3px]",
        size === "md" ? "h-9" : "h-8",
        fullWidth && "grid w-full",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-[3px] left-[3px] -z-10 rounded-pill bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.06)] transition-transform duration-[var(--d-base)] ease-[var(--ease)] dark:bg-surface-raised"
        style={{
          width: `calc((100% - 6px) / ${segments.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {segments.map((s, i) => {
        const selected = s.value === value;
        return (
          <button
            key={s.value}
            id={`${id}-${s.value}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(s.value)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-1.5 truncate rounded-pill px-3 font-semibold transition-colors duration-[var(--d-fast)]",
              size === "md" ? "text-[15px]" : "text-[13px]",
              selected ? "text-fg" : "text-fg-secondary hover:text-fg",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
