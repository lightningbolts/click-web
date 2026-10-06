'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Menu as MenuIcon, QrCode, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ds/Button';
import { ClickMark } from '@/components/ds/ClickMark';
import { CountBadge } from '@/components/ds/CountBadge';
import { IconButton } from '@/components/ds/IconButton';
import { Tooltip } from '@/components/ds/Tooltip';
import { activeAppSection, appNavItems, isThreadPath, loginHref, type AppNavItem } from '@/lib/shell/appNav';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';
import { ActivityBell } from '@/components/activity/ActivityPopover';
import { AccountMenu } from './AccountMenu';
import { useShellHeader } from './ShellContext';
import { WaitlistButton } from './WaitlistButton';
import { openCommandPalette } from './commandPaletteEvents';

/** Fixed-size underline: solid when current, pulsing while navigation to it is pending. */
function NavUnderline({ active }: { active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 -bottom-2 h-0.5 rounded-full bg-fg transition-opacity duration-[var(--d-fast)]',
        pending ? 'animate-pulse opacity-40' : active ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

function AppNavLink({ item, active, unread }: { item: AppNavItem; active: boolean; unread: number }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={item.id === 'clicks' && unread > 0 ? `Clicks, ${unread} unread` : undefined}
      data-testid={`nav-${item.id}`}
      className={cn(
        'type-body-strong inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 transition-colors duration-[var(--d-fast)]',
        active ? 'text-fg' : 'text-fg-secondary hover:text-fg',
      )}
    >
      <span className="relative inline-flex items-center gap-1.5">
        {/* Tablet: icon-only except the current section. */}
        <Icon size={20} strokeWidth={1.75} aria-hidden className={cn('lg:hidden', active && 'hidden')} />
        <span className={cn(!active && 'md:max-lg:sr-only')}>{item.label}</span>
        <NavUnderline active={active} />
      </span>
      {item.id === 'clicks' ? <CountBadge count={unread} /> : null}
    </Link>
  );
  return active ? link : <Tooltip content={item.label}>{link}</Tooltip>;
}

const MARKETING_LINKS = [
  { href: '/events', label: 'Events' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/enterprise', label: 'For business' },
  { href: '/about', label: 'About' },
];

export type TopBarAuth =
  | { state: 'signed-in'; bootstrap: SessionBootstrap }
  | { state: 'signed-out' }
  /** Public pages before the client session is known: fixed-size placeholders, no shift. */
  | { state: 'unknown' };

/**
 * The one top bar (spec §6.1 / §6.2): 56 desktop / 52 mobile, sticky glass, hairline only
 * once the page has scrolled.
 */
export function TopBar({ auth, onOpenMarketingMenu }: { auth: TopBarAuth; onOpenMarketingMenu?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const header = useShellHeader();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const section = activeAppSection(pathname);
  // Clicks and Map are full-bleed app panes; everything else sits in the wide container.
  const fluid = section === 'clicks' || section === 'map';
  const signedIn = auth.state === 'signed-in';
  const bootstrap = signedIn ? auth.bootstrap : null;

  const onBack = () => {
    if (header?.backHref) router.push(header.backHref);
    else if (window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" />
      <header
        data-topbar
        data-scrolled={scrolled || undefined}
        className={cn(
          'material-glass sticky top-0 z-[60] h-[var(--topbar-height)] border-b border-transparent transition-[border-color] duration-[var(--d-base)]',
          'data-[scrolled]:border-hairline',
          // A phone thread is full screen; its own glass header carries Back (spec §7.2).
          isThreadPath(pathname) && 'max-md:hidden',
        )}
      >
        <div
          className={cn(
            'mx-auto flex h-full items-center gap-2 px-[var(--gutter)] md:gap-4',
            fluid ? 'max-w-none md:px-6' : 'max-w-[1280px]',
          )}
        >
          {/* Left: logo, or back + title on pushed mobile pages. */}
          {header ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 md:hidden">
              <IconButton icon={ChevronLeft} aria-label="Back" onClick={onBack} className="-ml-2" />
              <span className="type-headline truncate text-fg">{header.title}</span>
            </div>
          ) : null}
          <Link
            href="/"
            aria-label="Click home"
            className={cn('flex shrink-0 items-center gap-2 rounded-sm', header && 'max-md:hidden')}
          >
            <ClickMark size={24} />
            <span className="font-display text-[20px] font-extrabold leading-none tracking-tight text-fg max-lg:hidden max-md:inline">
              Click
            </span>
          </Link>

          {/* Center-left: nav (desktop/tablet). */}
          <nav aria-label="Primary" className="hidden min-w-0 items-center gap-1 md:flex">
            {signedIn
              ? appNavItems({ managesPlaces: bootstrap!.managesPlaces }).map((item) => (
                  <AppNavLink
                    key={item.id}
                    item={item}
                    active={section === item.id}
                    unread={bootstrap!.unreadTotal}
                  />
                ))
              : auth.state === 'signed-out'
                ? MARKETING_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={pathname === l.href ? 'page' : undefined}
                      className={cn(
                        'type-body-strong inline-flex h-9 items-center rounded-sm px-2.5',
                        pathname === l.href ? 'text-fg' : 'text-fg-secondary hover:text-fg',
                      )}
                    >
                      {l.label}
                    </Link>
                  ))
                : null}
          </nav>

          <div className={cn('ml-auto flex shrink-0 items-center gap-1 md:gap-2', header && 'max-md:ml-0')}>
            {signedIn ? (
              <>
                <Tooltip content="Search  ⌘K">
                  <IconButton icon={Search} aria-label="Search" onClick={openCommandPalette} />
                </Tooltip>
                <Button href="/add" size="sm" icon={QrCode} className="hidden md:inline-flex" data-testid="nav-add-click">
                  Add Click
                </Button>
                <ActivityBell hasNew={bootstrap!.hasActivity} />
                <span className="hidden md:inline-flex">
                  <AccountMenu bootstrap={bootstrap!} />
                </span>
              </>
            ) : auth.state === 'signed-out' ? (
              <>
                <Button href={loginHref(pathname)} variant="plain" size="sm" data-testid="nav-login">
                  Log in
                </Button>
                <WaitlistButton className="hidden md:inline-flex" />
                {onOpenMarketingMenu ? (
                  <IconButton
                    icon={MenuIcon}
                    aria-label="Open menu"
                    onClick={onOpenMarketingMenu}
                    className="md:hidden"
                    data-testid="nav-menu-toggle"
                  />
                ) : null}
              </>
            ) : (
              <span data-testid="nav-auth-loading" aria-hidden className="block size-8 rounded-full bg-fill-subtle" />
            )}
          </div>
        </div>
      </header>
    </>
  );
}
