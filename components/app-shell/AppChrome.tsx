'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { AuthSeed } from '@/lib/AuthContext';
import { ProductChromeOn } from '@/lib/shell/ProductChromeContext';
import { useShellBootstrap } from '@/lib/shell/useShellBootstrap';
import type { SessionBootstrap } from '@/lib/shell/sessionBootstrap';
import { TIME_ZONE_COOKIE } from '@/lib/time/viewerTimeZone';
import { hidesTabBar } from '@/lib/shell/appNav';
import { cn } from '@/lib/cn';
import { useShellHeader } from './ShellContext';
import { GlobalShortcuts } from './GlobalShortcuts';
import { MobileTabBar } from './MobileTabBar';
import { OnboardingGates } from './OnboardingGates';
import { TopBar } from './TopBar';

function Bars({ initial }: { initial: SessionBootstrap }) {
  const { bootstrap } = useShellBootstrap(initial);
  const b = bootstrap ?? initial;
  return (
    <>
      <TopBar auth={{ state: 'signed-in', bootstrap: b }} />
      <MobileTabBar bootstrap={b} />
      <GlobalShortcuts />
    </>
  );
}

/** Keeps `click_tz` current so server-rendered "today" matches the viewer's clock. */
function useTimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
    // The server guessed UTC (or an old zone); re-render once with the right one.
    if (zone !== 'UTC' || current) router.refresh();
  }, [router]);
}

/** Reserves room for the mobile tab bar only while it is showing. */
function Content({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const header = useShellHeader();
  const tabBar = !hidesTabBar(pathname) && !header?.hideTabBar;
  return <div className={cn('flex flex-1 flex-col', tabBar && 'pb-[var(--tabbar-height)]')}>{children}</div>;
}

/**
 * Signed-in shell (spec §6): server bootstrap in, complete bars on first paint. `data-app-shell`
 * tells CSS to hide the root `SiteChrome` and the marketing footer before hydration.
 */
export function AppChrome({
  user,
  bootstrap,
  children,
}: {
  user: User;
  bootstrap: SessionBootstrap;
  children: ReactNode;
}) {
  useTimeZoneCookie();
  return (
    <AuthSeed user={user}>
      <ProductChromeOn />
      <div data-app-shell className="flex min-h-[calc(100dvh)] flex-1 flex-col">
        <Bars initial={bootstrap} />
        <Content>{children}</Content>
      </div>
      <OnboardingGates />
    </AuthSeed>
  );
}
