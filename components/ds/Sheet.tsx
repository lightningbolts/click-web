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
 * (spec §5.4, mirrors iOS `.presentationDetents([.medium, .large])`). Medium sizes to the
 * content (40–92 % of the screen), so a short form shows whole and a long one scrolls.
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
  padded = true,
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
  /** Body inset matching the header (20 px sides). Off for full-bleed bodies (lists, chat). */
  padded?: boolean;
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
          // Focus the sheet itself on open (a field with autoFocus keeps it), not the grab
          // handle or Close, which would show a focus ring before anyone pressed a key.
          onOpenAutoFocus={(e) => {
            const sheet = e.currentTarget as HTMLElement;
            e.preventDefault();
            if (!sheet.contains(document.activeElement)) sheet.focus();
          }}
          className={cn(
            "fixed z-[81] flex flex-col bg-bg-elevated text-fg shadow-overlay outline-none",
            desktop
              ? cn(
                  "ds-anim-sheet-right bottom-0 right-0 top-0 w-full",
                  size === "md" ? "max-w-[420px]" : "max-w-[560px]",
                )
              : cn(
                  "ds-anim-sheet-up inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)] transition-[height] duration-[var(--d-slow)] ease-[var(--ease-out-expo)] [interpolate-size:allow-keywords]",
                  // Medium fits the content (never a form cut off under the fold); large fills.
                  detent === "medium" ? "h-auto min-h-[40dvh]" : "h-[92dvh]",
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
              desktop ? "min-h-14 border-b border-hairline py-2.5" : "min-h-12 py-2",
            )}
          >
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="type-headline truncate text-fg">
                {title}
              </RadixDialog.Title>
              <RadixDialog.Description
                className={
                  description
                    ? "type-meta line-clamp-2 text-fg-tertiary"
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
          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", padded && "px-5 pb-6 pt-4")}>
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
