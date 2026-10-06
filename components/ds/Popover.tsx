"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

/** Floating panel (spec §5.4): `--bg-elevated`, `--r-md`, overlay shadow. */
export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "ds-anim-popover z-[90] rounded-md bg-bg-elevated text-fg shadow-overlay outline-none",
          className,
        )}
        {...rest}
      />
    </RadixPopover.Portal>
  );
}
