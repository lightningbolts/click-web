"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "size" | "onChange" | "value"
> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name when no visible label exists. */
  label: string;
  size?: "md" | "lg";
};

/** Capsule search input with a clear button (spec §5.5). */
export const SearchField = forwardRef<HTMLInputElement, Props>(
  function SearchField(
    {
      value,
      onValueChange,
      label,
      size = "md",
      className,
      placeholder = "Search",
      ...rest
    },
    ref,
  ) {
    return (
      <div className={cn("relative min-w-0", className)}>
        <Search
          size={16}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-tertiary"
        />
        <input
          ref={ref}
          type="search"
          role="searchbox"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              onValueChange("");
            }
            rest.onKeyDown?.(e);
          }}
          className={cn(
            "type-body block w-full rounded-pill bg-fill-subtle pl-10 pr-10 text-fg outline-none placeholder:text-fg-tertiary",
            "transition-shadow duration-[var(--d-fast)] focus:shadow-[0_0_0_2px_var(--accent)] focus-visible:outline-none",
            "[&::-webkit-search-cancel-button]:hidden",
            size === "md" ? "h-10" : "h-11",
          )}
          {...rest}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onValueChange("")}
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-fill-strong text-fg-secondary hover:text-fg"
          >
            <X size={14} strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  },
);
