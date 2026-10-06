import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { LegacyDashboardHost } from '@/components/app-shell/LegacyDashboardHost';

/** Signed-in app routes (spec §6): one server shell, bars complete on first paint. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <LegacyDashboardHost />
      </Suspense>
      {children}
    </AppShell>
  );
}
