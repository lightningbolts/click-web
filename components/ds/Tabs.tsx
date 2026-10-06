"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as RadixTabs from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CountBadge } from "./CountBadge";

const tabClass = (selected: boolean) =>
  cn(
    "relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold transition-colors duration-[var(--d-fast)]",
    "text-[15px] leading-[22px]",
    selected ? "text-fg" : "text-fg-tertiary hover:text-fg-secondary",
    "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-fg after:transition-opacity after:duration-[var(--d-base)]",
    selected ? "after:opacity-100" : "after:opacity-0",
  );

const listClass =
  "no-scrollbar edge-fade-x flex gap-6 overflow-x-auto border-b border-hairline";

export type LinkTab = {
  href: string;
  label: ReactNode;
  count?: number;
  /** Match nested routes too. */ prefix?: boolean;
};

/**
 * URL-backed page-section tabs (spec §5.2: every section tab set MUST be a URL segment).
 * Renders links with `aria-current="page"`; use `Tabs` for in-page panels.
 */
export function LinkTabs({
  tabs,
  label,
  className,
}: {
  tabs: readonly LinkTab[];
  label: string;
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label={label} className={cn(listClass, className)}>
      {tabs.map((t) => {
        const selected = t.prefix
          ? pathname === t.href || pathname.startsWith(`${t.href}/`)
          : pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={selected ? "page" : undefined}
            className={tabClass(selected)}
          >
            {t.label}
            {t.count ? <CountBadge count={t.count} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** In-page tabs (Radix) with the same look. */
export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn(listClass, className)} {...rest} />;
}

export function TabsTrigger({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        tabClass(false),
        "data-[state=active]:text-fg data-[state=active]:after:opacity-100",
        className,
      )}
      {...rest}
    />
  );
}
