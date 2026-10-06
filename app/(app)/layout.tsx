import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';

/** Signed-in app routes (spec §6): one server shell, bars complete on first paint. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
