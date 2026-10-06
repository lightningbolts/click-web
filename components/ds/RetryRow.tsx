"use client";

import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/** "Couldn't load {thing}." + Retry (spec §5.6). Every fallible module uses this, never zeros. */
export function RetryRow({
  thing,
  onRetry,
  busy,
  className,
}: {
  thing: string;
  onRetry: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 py-2 text-fg-secondary",
        className,
      )}
    >
      <CircleAlert
        size={16}
        strokeWidth={2}
        aria-hidden
        className="shrink-0 text-fg-tertiary"
      />
      <span className="type-body min-w-0 flex-1">
        Couldn&apos;t load {thing}.
      </span>
      <Button variant="plain" size="sm" onClick={onRetry} loading={busy}>
        Retry
      </Button>
    </div>
  );
}
