"use client";

import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ds/IconButton";

/** − n + for one ticket type. Buttons keep 44 px hit targets; the count is announced politely. */
export function QuantityStepper({
  name,
  value,
  max,
  disabled = false,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        icon={Minus}
        variant="filled"
        aria-label={`Fewer ${name}`}
        disabled={disabled || value <= 0}
        onClick={() => onChange(value - 1)}
      />
      <span
        aria-live="polite"
        aria-label={`${value} ${name}`}
        data-testid="ticket-quantity"
        className="type-body-strong tabular w-7 text-center text-fg"
      >
        {value}
      </span>
      <IconButton
        icon={Plus}
        variant="filled"
        aria-label={`More ${name}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      />
    </div>
  );
}
