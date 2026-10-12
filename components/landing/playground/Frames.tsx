'use client';

import type { ReactNode } from 'react';
import {
  BatteryFull,
  ChevronLeft,
  CirclePlus,
  CircleUserRound,
  House,
  Lock,
  Navigation,
  SignalHigh,
  UsersRound,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { DEVICE_HEIGHT } from './layout';
import type { PhoneTab } from './types';


const PHONE_TABS: { id: PhoneTab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'add', label: 'Add Click', icon: CirclePlus },
  { id: 'clicks', label: 'Clicks', icon: UsersRound },
  { id: 'map', label: 'Map', icon: Navigation },
  { id: 'me', label: 'Me', icon: CircleUserRound },
];

/**
 * An iPhone running Click: status bar, Dynamic Island and the floating glass tab bar from
 * the iOS app. The tab bar steps aside on pushed screens, as it does in a chat.
 */
export function PhoneFrame({
  tab,
  onTab,
  showTabs,
  clicksBadge,
  children,
}: {
  tab: PhoneTab;
  onTab: (tab: PhoneTab) => void;
  showTabs: boolean;
  clicksBadge: number;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="demo-phone"
      className={cn(
        'relative mx-auto w-full max-w-[360px] shrink-0 rounded-device-frame bg-black p-2.5 shadow-overlay',
        'ring-1 ring-white/10',
        DEVICE_HEIGHT,
      )}
    >
      <div className="relative isolate flex h-full flex-col overflow-hidden rounded-device bg-bg text-fg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between px-7 pt-1"
        >
          <span className="type-body-strong tabular">9:41</span>
          <span className="flex items-center gap-1">
            <SignalHigh size={16} strokeWidth={2.5} />
            <Wifi size={15} strokeWidth={2.5} />
            <BatteryFull size={20} strokeWidth={2} />
          </span>
        </div>
        <div aria-hidden className="absolute left-1/2 top-2.5 z-40 h-7 w-24 -translate-x-1/2 rounded-pill bg-black" />
        <div className="relative min-h-0 flex-1">{children}</div>
        <nav
          aria-label="iPhone tabs"
          className={cn(
            'material-glass absolute inset-x-3 bottom-3 z-30 grid h-16 grid-cols-5 rounded-pill shadow-overlay',
            'transition-[opacity,translate] duration-[var(--d-base)] ease-[var(--ease)]',
            showTabs ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
          )}
          aria-hidden={!showTabs || undefined}
        >
          {PHONE_TABS.map((item) => {
            const Icon = item.icon;
            const active = item.id === tab;
            const badge = item.id === 'clicks' && clicksBadge > 0;
            return (
              <button
                key={item.id}
                type="button"
                tabIndex={showTabs ? undefined : -1}
                aria-current={active ? 'page' : undefined}
                aria-label={badge ? `${item.label}, ${clicksBadge} new` : item.label}
                data-testid={`phone-tab-${item.id}`}
                onClick={() => onTab(item.id)}
                className={cn(
                  'press type-tab-label m-1 flex flex-col items-center justify-center gap-0.5 rounded-pill',
                  active ? 'bg-fill-subtle text-accent' : 'text-fg',
                )}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {badge ? (
                    <span className="type-badge tabular absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-live px-1 text-white">
                      {clicksBadge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/** A tab root: scrolls under the status bar and stops above the floating tab bar. */
export function PhoneScreen({
  title,
  trailing,
  children,
  className,
  testId,
}: {
  title?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn('no-scrollbar h-full overflow-y-auto px-4 pb-24 pt-12', className)}>
      {title ? (
        <div className="mb-4 flex items-end justify-between gap-3 pt-2">
          <h3 className="type-title-1 min-w-0 text-fg">{title}</h3>
          {trailing}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** A pushed screen: glass bar with Back, then its own scroller and optional footer. */
export function PhonePushed({
  title,
  onBack,
  backLabel = 'Back',
  leading,
  trailing,
  footer,
  children,
  bodyClassName,
  testId,
}: {
  title?: ReactNode;
  onBack: () => void;
  backLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex h-full flex-col">
      <div className="material-glass relative z-20 flex shrink-0 items-center gap-2 border-b border-hairline px-2 pb-2 pt-12">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="press flex size-9 shrink-0 items-center justify-center rounded-full text-accent hover:bg-hover"
        >
          <ChevronLeft size={24} strokeWidth={2.25} aria-hidden />
        </button>
        {leading}
        <div className="min-w-0 flex-1">{typeof title === 'string' ? <h3 className="type-headline truncate text-fg">{title}</h3> : title}</div>
        {trailing}
      </div>
      <div className={cn('no-scrollbar min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
      {footer ? <div className="material-glass shrink-0 border-t border-hairline px-3 pb-6 pt-3">{footer}</div> : null}
    </div>
  );
}

/** A desktop browser window on joinclick.co. `className` sets its height (defaults to the phone's). */
export function BrowserFrame({
  path,
  children,
  className = DEVICE_HEIGHT,
  testId = 'demo-web',
}: {
  path: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn('flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface shadow-overlay ring-1 ring-hairline', className)}
    >
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline bg-surface-raised px-4">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-3 rounded-full bg-fill-strong" />
          <span className="size-3 rounded-full bg-fill-strong" />
          <span className="size-3 rounded-full bg-fill-strong" />
        </span>
        <span className="type-meta mx-auto flex h-7 min-w-0 max-w-sm flex-1 items-center justify-center gap-1.5 truncate rounded-pill bg-bg px-3 text-fg-secondary">
          <Lock size={12} aria-hidden className="shrink-0" />
          <span className="truncate">joinclick.co{path}</span>
        </span>
        <span aria-hidden className="w-[42px]" />
      </div>
      <div className="@container relative isolate flex min-h-0 flex-1 flex-col bg-bg text-fg">{children}</div>
    </div>
  );
}
