'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CirclePlus, Home, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ds/Avatar';
import { activeAppSection, hidesTabBar } from '@/lib/shell/appNav';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';
import { useShellHeader } from './ShellContext';

const tabCls =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 type-tab-label';

/**
 * Mobile tab bar (spec §6.2): Home · Clicks · Add Click · Events · Me. Glass, top hairline,
 * 56 + safe area. Steps aside on pushed screens.
 */
export function MobileTabBar({ bootstrap }: { bootstrap: SessionBootstrap }) {
  const pathname = usePathname();
  const header = useShellHeader();
  if (hidesTabBar(pathname) || header?.hideTabBar) return null;

  const section = activeAppSection(pathname);
  const { viewer, unreadTotal } = bootstrap;
  const color = (active: boolean) => (active ? 'text-accent' : 'text-fg-tertiary');

  return (
    <nav
      aria-label="Tabs"
      data-tabbar
      className="material-glass fixed inset-x-0 bottom-0 z-[60] flex h-[var(--tabbar-height)] border-t border-hairline pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link href="/" aria-current={section === 'home' ? 'page' : undefined} className={cn(tabCls, color(section === 'home'))}>
        <Home size={24} strokeWidth={section === 'home' ? 2.25 : 1.75} aria-hidden />
        Home
      </Link>
      <Link
        href="/clicks"
        aria-current={section === 'clicks' ? 'page' : undefined}
        aria-label={unreadTotal > 0 ? `Clicks, ${unreadTotal} unread` : undefined}
        className={cn(tabCls, color(section === 'clicks'))}
      >
        <span className="relative">
          <MessageCircle size={24} strokeWidth={section === 'clicks' ? 2.25 : 1.75} aria-hidden />
          {unreadTotal > 0 ? (
            <span className="type-badge tabular absolute -right-2.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-action px-1 text-on-action ring-2 ring-[var(--bg)]">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          ) : null}
        </span>
        Clicks
      </Link>
      <Link
        href="/add"
        aria-current={section === 'add' ? 'page' : undefined}
        className={cn(tabCls, 'text-action')}
        data-testid="tab-add-click"
      >
        <CirclePlus size={28} strokeWidth={2} aria-hidden className="-my-0.5 fill-action stroke-[var(--text-on-action)]" />
        Add Click
      </Link>
      <Link
        href="/events"
        aria-current={section === 'events' ? 'page' : undefined}
        className={cn(tabCls, color(section === 'events'))}
      >
        <CalendarDays size={24} strokeWidth={section === 'events' ? 2.25 : 1.75} aria-hidden />
        Events
      </Link>
      <Link href="/me" aria-current={section === 'me' ? 'page' : undefined} className={cn(tabCls, color(section === 'me'))}>
        <span className={cn('rounded-full', section === 'me' && 'ring-2 ring-accent ring-offset-1 ring-offset-[var(--bg)]')}>
          <Avatar seed={viewer.id} name={viewer.name} src={viewer.avatarUrl} size={24} />
        </span>
        Me
      </Link>
    </nav>
  );
}
