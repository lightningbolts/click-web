"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  /** @deprecated Cards never lift or change on hover (spec §5.4). */
  hover?: boolean;
  /** @deprecated No glow in Quiet Presence. */
  glow?: "purple" | "blue" | "green" | "none";
}

/** Insights card on the ds surface (legacy name kept for call sites): no border, no shadow. */
export function GlassPanel({ children, className = "" }: GlassPanelProps) {
  return <div className={cn("rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]", className)}>{children}</div>;
}
