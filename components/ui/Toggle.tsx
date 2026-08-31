"use client";

import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export type ToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
};

export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className,
}: ToggleProps) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border-hard bg-surface-container outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <Switch.Thumb
        className="absolute left-0.5 top-1/2 block h-5 w-5 shrink-0 rounded-full bg-white shadow transition-[transform] duration-200 ease-out"
        style={{
          transform: checked ? "translate(20px, -50%)" : "translate(0, -50%)",
        }}
      />
    </Switch.Root>
  );
}
