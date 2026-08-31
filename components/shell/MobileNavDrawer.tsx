"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mobile nav panel. Stays mounted so open/close can animate.
 * Overlay fades; panel slides from the right.
 */
export default function MobileNavDrawer({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[100000] md:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-on-surface/40 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid="mobile-nav-drawer"
        data-open={open ? "true" : "false"}
        className={cn(
          "absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-l border-border-hard bg-surface motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {children}
      </aside>
    </div>
  );
}
