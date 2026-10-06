import { Suspense, type ReactNode } from 'react';
import { ClicksWorkspace } from '@/components/clicks/ClicksWorkspace';

/**
 * `/clicks` and its thread routes share one workspace (spec §7.2), so the inbox, its scroll
 * position and live subscriptions survive opening and closing threads. Pages render nothing.
 */
export default function ClicksLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ClicksWorkspace />
      </Suspense>
      {children}
    </>
  );
}
