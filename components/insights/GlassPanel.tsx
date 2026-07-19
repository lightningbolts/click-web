"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  /** @deprecated Ignored — Functional Clarity has no glow */
  glow?: "purple" | "blue" | "green" | "none";
}

/** Opaque FC card (legacy name retained for call-site compatibility). */
export function GlassPanel({
  children,
  className = "",
  hover = true,
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "fc-card transition-colors",
        hover && "hover:bg-surface-container-low",
        className,
      )}
    >
      {children}
    </div>
  );
}
