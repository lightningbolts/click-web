"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";

const WIDTH = {
  sm: "max-w-[440px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
} as const;

export const overlayClassName =
  "ds-anim-overlay fixed inset-0 z-[80] bg-[var(--overlay-scrim)]";

/**
 * Centered modal (spec §5.4): `--bg-elevated`, `--r-xl`, overlay shadow, 0.98→1 enter.
 * Radix supplies the focus trap, Esc to close and focus return.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = "sm",
  footer,
  hideClose,
  children,
  className,
  trigger,
  initialFocusSelector,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  /** Visible supporting sentence under the title (wired to aria-describedby). */
  description?: ReactNode;
  size?: keyof typeof WIDTH;
  footer?: ReactNode;
  hideClose?: boolean;
  children?: ReactNode;
  className?: string;
  trigger?: ReactNode;
  /** CSS selector inside the dialog to focus on open (e.g. the safe button). */
  initialFocusSelector?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? (
        <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      ) : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClassName} />
        <RadixDialog.Content
          onOpenAutoFocus={
            initialFocusSelector
              ? (e) => {
                  const el = (
                    e.currentTarget as HTMLElement | null
                  )?.querySelector<HTMLElement>(initialFocusSelector);
                  if (el) {
                    e.preventDefault();
                    el.focus();
                  }
                }
              : undefined
          }
          className={cn(
            "ds-anim-dialog fixed left-1/2 top-1/2 z-[81] flex max-h-[min(88dvh,800px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-xl bg-bg-elevated text-fg shadow-overlay outline-none",
            WIDTH[size],
            className,
          )}
        >
          <div className="flex items-start gap-3 px-6 pb-2 pt-5">
            <div className="min-w-0 flex-1 pt-1.5">
              <RadixDialog.Title className="type-headline text-fg">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="type-body mt-1 text-fg-secondary">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">
                  {typeof title === "string" ? title : "Dialog"}
                </RadixDialog.Description>
              )}
            </div>
            {hideClose ? null : (
              <RadixDialog.Close asChild>
                <IconButton
                  icon={X}
                  aria-label="Close"
                  variant="filled"
                  size="sm"
                  className="-mr-2"
                />
              </RadixDialog.Close>
            )}
          </div>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 px-6 pb-5 pt-1">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;
