'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sheet } from '@/components/ds/Sheet';
import { useAuth } from '@/lib/AuthContext';
import { useHydrated } from '@/lib/react/useHydrated';
import { loginHref } from '@/lib/shell/appNav';
import { useShellBootstrap } from '@/lib/shell/useShellBootstrap';
import { useProductChrome } from '@/lib/shell/ProductChromeContext';
import { buttonClassName } from '@/components/ds/Button';
import { GlobalShortcuts } from './GlobalShortcuts';
import { LiveActivity } from './LiveActivity';
import { MobileTabBar } from './MobileTabBar';
import { TopBar, type TopBarAuth } from './TopBar';
import { WaitlistButton } from './WaitlistButton';

const DRAWER_LINKS = [
  { href: '/events', label: 'Events' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/enterprise', label: 'For business' },
  { href: '/about', label: 'About' },
];

/**
 * Chrome for static and public pages (spec §11.3.1): the page HTML stays cacheable, and the
 * account area is a client island that resolves from the browser session. A signed-in route
 * renders `AppShell` instead, and CSS (`:has([data-app-shell])`) hides this before paint.
 */
export function SiteChrome() {
  const pathname = usePathname();
  const auth = useAuth();
  const hydrated = useHydrated();
  const { user, loading } = hydrated ? auth : auth.serverSnapshot;
  const appShellMounted = useProductChrome();
  const { bootstrap } = useShellBootstrap(null, Boolean(user) && !appShellMounted);
  const [menuOpen, setMenuOpen] = useState(false);

  // /insights keeps its own workspace chrome until it moves under a Place (phase 5).
  if (pathname.startsWith('/insights') || appShellMounted) return null;

  const state: TopBarAuth =
    user && bootstrap
      ? { state: 'signed-in', bootstrap }
      : user || loading
        ? { state: 'unknown' }
        : { state: 'signed-out' };

  return (
    <div data-site-chrome className="contents">
      <TopBar auth={state} onOpenMarketingMenu={() => setMenuOpen(true)} />
      {state.state === 'signed-in' ? (
        <>
          <MobileTabBar bootstrap={state.bootstrap} />
          <GlobalShortcuts />
          <LiveActivity viewerId={state.bootstrap.viewer.id} />
        </>
      ) : null}
      {state.state === 'signed-out' ? (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" padded={false}>
          <nav aria-label="Site" className="flex flex-col gap-1 px-2 pb-4">
            {DRAWER_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="type-headline flex h-12 items-center rounded-md px-3 text-fg hover:bg-hover"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 px-1">
              <Link
                href={loginHref(pathname)}
                onClick={() => setMenuOpen(false)}
                className={buttonClassName({ variant: 'secondary', size: 'lg', fullWidth: true })}
              >
                Log in
              </Link>
              <WaitlistButton className="h-12 w-full text-base" />
            </div>
          </nav>
        </Sheet>
      ) : null}
    </div>
  );
}
