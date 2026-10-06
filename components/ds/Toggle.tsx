"use client";

import * as Switch from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** 44×26 switch (spec §5.2): on = `--action`, off = `--fill-strong`, white 22 px thumb. */
export function Toggle({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof Switch.Root>) {
  return (
    <Switch.Root
      className={cn(
        "relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-pill p-0.5 transition-colors duration-[var(--d-fast)]",
        "bg-fill-strong data-[state=checked]:bg-action disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      <Switch.Thumb className="block size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-[var(--d-fast)] ease-[var(--ease)] data-[state=checked]:translate-x-[18px]" />
    </Switch.Root>
  );
}
