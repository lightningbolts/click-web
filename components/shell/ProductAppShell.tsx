"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LogOut, Menu, X } from "lucide-react";
import ClickLogo from "@/components/ClickLogo";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNavDrawer from "@/components/shell/MobileNavDrawer";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";
import { cn } from "@/lib/cn";

export type ProductAppShellItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  exact?: boolean;
  testId?: string;
};

export type ProductAppShellLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type ProductAppShellProps = {
  productLabel: string;
  productHref: string;
  items: ProductAppShellItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  extraNav?: ProductAppShellLink[];
  userLabel?: string | null;
  userAvatarUrl?: string | null;
  onSignOut?: () => void | Promise<void>;
  rootTestId?: string;
  chromeTestId?: string;
  itemTestIdPrefix?: string;
  /** Lock the main pane to remaining viewport height (chat / full-bleed maps). */
  fillViewport?: boolean;
  /** Skip the welcome title row so a child (e.g. chat) can use the full pane. */
  hideHeader?: boolean;
  children: ReactNode;
};

function itemIsActive(
  item: ProductAppShellItem,
  pathname: string,
  activeId: string | undefined,
): boolean {
  if (activeId !== undefined) {
    return activeId === item.id;
  }
  if (item.href) {
    const hrefPath = item.href.split("?")[0] || item.href;
    return item.exact
      ? pathname === hrefPath
      : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  }
  return false;
}

export default function ProductAppShell({
  productLabel,
  productHref,
  items,
  activeId,
  onSelect,
  title,
  subtitle,
  actions,
  extraNav,
  userLabel,
  userAvatarUrl,
  onSignOut,
  rootTestId,
  chromeTestId,
  itemTestIdPrefix,
  fillViewport = false,
  hideHeader = false,
  children,
}: ProductAppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, activeId]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const renderItem = (
    item: ProductAppShellItem,
    opts?: { onNavigate?: () => void; stacked?: boolean },
  ) => {
    const Icon = item.icon;
    const active = itemIsActive(item, pathname, activeId);
    const testId = opts?.stacked
      ? undefined
      : item.testId ?? (itemTestIdPrefix ? `${itemTestIdPrefix}-${item.id}` : undefined);
    const className = cn(
      "inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold transition-colors",
      opts?.stacked && "w-full",
      active
        ? "bg-primary-container text-on-primary-container"
        : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
    );
    const body = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span>{item.label}</span>
      </>
    );
    if (item.href) {
      return (
        <Link
          key={item.id}
          href={item.href}
          data-testid={testId}
          aria-current={active ? "page" : undefined}
          onClick={opts?.onNavigate}
          className={className}
        >
          {body}
        </Link>
      );
    }
    return (
      <button
        key={item.id}
        type="button"
        data-testid={testId}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          onSelect?.(item.id);
          opts?.onNavigate?.();
        }}
        className={className}
      >
        {body}
      </button>
    );
  };

  const accountBlock = (opts?: { onNavigate?: () => void; stacked?: boolean }) => (
    <div className={cn("flex items-center gap-2", opts?.stacked && "flex-col items-stretch")}>
      <ThemeToggle />
      {userLabel ? (
        <div className="flex min-w-0 items-center gap-2 px-1">
          <ConnectionPeerAvatar label={userLabel} imageUrl={userAvatarUrl} size="sm" />
          <p className="truncate text-xs font-medium text-on-surface-variant">{userLabel}</p>
        </div>
      ) : null}
      {onSignOut ? (
        <button
          type="button"
          data-testid={opts?.stacked ? undefined : "nav-sign-out"}
          onClick={() => {
            opts?.onNavigate?.();
            void onSignOut();
          }}
          className={cn(
            "fc-btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs hover:border-error hover:text-error",
            opts?.stacked && "w-full",
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col bg-background text-on-surface",
        fillViewport ? "h-dvh overflow-hidden" : "min-h-dvh",
      )}
      data-testid={rootTestId}
      data-fill-viewport={fillViewport ? "true" : undefined}
    >
      <header
        data-navbar-root="true"
        data-testid={chromeTestId}
        className="sticky top-0 z-40 border-b border-border-hard bg-surface py-3"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className={PAGE_COLUMN_CLASS}>
          <div className="flex items-center gap-3">
            <Link href={productHref} className="flex shrink-0 items-center gap-2">
              <ClickLogo variant="boxed" size={28} className="h-7 w-7 rounded-[8px] border border-border-hard" />
              <span className="text-sm font-bold">{productLabel}</span>
            </Link>
            <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">{accountBlock()}</div>
            <button
              type="button"
              className="ml-auto rounded-[8px] border border-border-hard p-2 md:hidden"
              data-testid="nav-menu-toggle"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
          <nav
            className="mt-3 hidden flex-wrap items-center gap-1 md:flex"
            aria-label="Product"
          >
            {items.map((item) => renderItem(item))}
            {extraNav?.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <MobileNavDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} labelledBy="mobile-nav-title">
        <div className="flex h-full min-h-0 flex-col" id="mobile-nav-drawer">
          <div className="flex items-center gap-2.5 border-b border-border-hard px-4 py-4">
            <ClickLogo variant="boxed" size={32} className="h-8 w-8 rounded-[8px] border border-border-hard" />
            <span id="mobile-nav-title" className="text-sm font-bold text-on-surface">
              {productLabel}
            </span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Product">
            {items.map((item) =>
              renderItem(item, { onNavigate: () => setMobileOpen(false), stacked: true }),
            )}
          </nav>
          {extraNav && extraNav.length > 0 ? (
            <div className="border-t border-border-hard p-3">
              {extraNav.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
          <div className="border-t border-border-hard p-3">
            {accountBlock({ onNavigate: () => setMobileOpen(false), stacked: true })}
          </div>
        </div>
      </MobileNavDrawer>

      <div className="flex min-h-0 flex-1 flex-col">
        {hideHeader ? null : (
          <div className={cn(PAGE_COLUMN_CLASS, "flex shrink-0 flex-wrap items-start justify-between gap-4 py-6")}>
            <div>
              <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        )}
        <div
          className={cn(
            PAGE_COLUMN_CLASS,
            "min-h-0 min-w-0 flex-1",
            fillViewport ? "flex flex-col overflow-hidden py-4" : "overflow-y-auto pb-8",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
