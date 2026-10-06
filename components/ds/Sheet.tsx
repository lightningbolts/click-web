"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";
import { overlayClassName } from "./Dialog";
import { useMediaQuery } from "./useMediaQuery";

/**
 * Side drawer on desktop, bottom sheet with medium/large detents below 768 px
 * (spec §5.4, mirrors iOS `.presentationDetents([.medium, .large])`).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  initialDetent = "medium",
  headerAction,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: "md" | "lg";
  initialDetent?: "medium" | "large";
  headerAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const [detent, setDetent] = useState(initialDetent);

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) setDetent(initialDetent);
        onOpenChange(o);
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClassName} />
        <RadixDialog.Content
          className={cn(
            "fixed z-[81] flex flex-col bg-bg-elevated text-fg shadow-overlay outline-none",
            desktop
              ? cn(
                  "ds-anim-sheet-right bottom-0 right-0 top-0 w-full",
                  size === "md" ? "max-w-[420px]" : "max-w-[560px]",
                )
              : cn(
                  "ds-anim-sheet-up inset-x-0 bottom-0 rounded-t-xl pb-[env(safe-area-inset-bottom)] transition-[height] duration-[var(--d-slow)] ease-[var(--ease-out-expo)]",
                  detent === "medium" ? "h-[55dvh]" : "h-[92dvh]",
                ),
            className,
          )}
        >
          {desktop ? null : (
            <button
              type="button"
              aria-label={detent === "medium" ? "Expand sheet" : "Shrink sheet"}
              onClick={() =>
                setDetent((d) => (d === "medium" ? "large" : "medium"))
              }
              className="mx-auto mt-2 flex h-4 w-16 shrink-0 items-center justify-center"
            >
              <span
                className="h-[5px] w-9 rounded-full bg-fill-strong"
                aria-hidden
              />
            </button>
          )}
          <div
            className={cn(
              "flex items-center gap-3 px-5",
              desktop ? "h-14 border-b border-hairline" : "h-12",
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="type-headline truncate text-fg">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description
                className={
                  description
                    ? "type-meta truncate text-fg-tertiary"
                    : "sr-only"
                }
              >
                {description ?? (typeof title === "string" ? title : "Sheet")}
              </RadixDialog.Description>
            </div>
            {headerAction}
            <RadixDialog.Close asChild>
              <IconButton
                icon={X}
                aria-label="Close"
                variant="filled"
                size="sm"
              />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
          {footer ? (
            <div className="border-t border-hairline px-5 py-3">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
