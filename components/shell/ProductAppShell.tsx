"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LogOut, Menu, X } from "lucide-react";
import ClickLogo from "@/components/ClickLogo";
import ThemeToggle from "@/components/ThemeToggle";
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
  onSignOut?: () => void | Promise<void>;
  rootTestId?: string;
  chromeTestId?: string;
  itemTestIdPrefix?: string;
  children: ReactNode;
};

function itemIsActive(
  item: ProductAppShellItem,
  pathname: string,
  activeId: string | undefined,
): boolean {
  if (item.href) {
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return activeId === item.id;
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
  onSignOut,
  rootTestId,
  chromeTestId,
  itemTestIdPrefix,
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

  const renderItem = (item: ProductAppShellItem, opts?: { onNavigate?: () => void }) => {
    const Icon = item.icon;
    const active = itemIsActive(item, pathname, activeId);
    const testId = item.testId ?? (itemTestIdPrefix ? `${itemTestIdPrefix}-${item.id}` : undefined);
    const className = cn(
      "flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold transition-colors",
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

  const sidebar = (opts?: { onNavigate?: () => void }) => (
    <div className="flex h-full min-h-0 flex-col">
      <Link
        href={productHref}
        onClick={opts?.onNavigate}
        className="flex items-center gap-2.5 border-b border-border-hard px-4 py-4"
      >
        <ClickLogo variant="boxed" size={32} className="h-8 w-8 rounded-[8px] border border-border-hard" />
        <span className="text-sm font-bold text-on-surface">{productLabel}</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Product">
        {items.map((item) => renderItem(item, opts))}
      </nav>
      {extraNav && extraNav.length > 0 ? (
        <div className="border-t border-border-hard p-3">
          {extraNav.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={opts?.onNavigate}
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <ThemeToggle />
        </div>
        {userLabel ? (
          <p className="mb-2 truncate px-1 text-xs font-medium text-on-surface-variant">{userLabel}</p>
        ) : null}
        {onSignOut ? (
          <button
            type="button"
            data-testid="nav-sign-out"
            onClick={() => void onSignOut()}
            className="fc-btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2 text-xs hover:border-error hover:text-error"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen bg-background text-on-surface"
      data-testid={rootTestId}
    >
      <header
        data-navbar-root="true"
        className="sticky top-0 z-40 flex items-center justify-between border-b border-border-hard bg-surface px-4 py-3 md:hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <Link href={productHref} className="flex items-center gap-2">
          <ClickLogo variant="boxed" size={28} className="h-7 w-7 rounded-[8px] border border-border-hard" />
          <span className="text-sm font-bold">{productLabel}</span>
        </Link>
        <button
          type="button"
          className="rounded-[8px] border border-border-hard p-2"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-on-surface/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative h-full w-72 max-w-[85vw] border-r border-border-hard bg-surface"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            {sidebar({ onNavigate: () => setMobileOpen(false) })}
          </aside>
        </div>
      ) : null}

      <div className="md:flex md:min-h-screen">
        <aside
          data-testid={chromeTestId}
          className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-border-hard bg-surface md:block"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          {sidebar()}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-6 md:px-8">
            <div>
              <h1 className="text-2xl font-bold text-on-surface">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          <div className="px-4 pb-8 md:px-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
