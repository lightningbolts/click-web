import { Suspense, type ReactNode } from 'react';
import { ClicksWorkspace } from '@/components/clicks/ClicksWorkspace';
import { loadInboxPreload } from '@/lib/server/clicks/inboxPreload';

/**
 * `/clicks` and its thread routes share one workspace (spec §7.2), so the inbox, its scroll
 * position and live subscriptions survive opening and closing threads. Pages render nothing.
 * The inbox's first load starts here, unawaited, and streams to the workspace with the page.
 */
export default function ClicksLayout({ children }: { children: ReactNode }) {
  const preload = loadInboxPreload();
  return (
    <>
      <Suspense fallback={null}>
        <ClicksWorkspace preload={preload} />
      </Suspense>
      {children}
    </>
  );
}
