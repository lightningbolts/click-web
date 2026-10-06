'use client';

import { useSyncExternalStore } from 'react';
import { Search, WifiOff } from 'lucide-react';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { openCommandPalette } from '@/components/app-shell/commandPaletteEvents';
import { homeGreetingFor } from '@/lib/home/selectOpportunity';

const noSubscribe = () => () => {};

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * ① Greeting (spec §7.1). The server renders it in the `click_tz` zone; after hydration it
 * re-reads the device clock, so a first visit without the cookie corrects itself.
 */
export function HomeGreeting({ firstName, serverHour }: { firstName: string; serverHour: number }) {
  const hour = useSyncExternalStore(noSubscribe, () => new Date().getHours(), () => serverHour);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  return (
    <header>
      <h1 className="type-title-1 text-fg">{homeGreetingFor(firstName, hour)}</h1>
      <p className="type-body mt-1 text-fg-tertiary">Ready to connect today?</p>
      <button
        type="button"
        onClick={openCommandPalette}
        className="type-body mt-4 flex h-10 w-full items-center gap-2 rounded-md bg-fill-subtle px-3 text-left text-fg-tertiary md:hidden"
      >
        <Search size={16} strokeWidth={2} aria-hidden />
        Search people, events, places
      </button>
      {online ? null : (
        <InlineNotice icon={WifiOff} className="mt-4" live>
          You’re offline. Home will refresh when you’re back.
        </InlineNotice>
      )}
    </header>
  );
}
