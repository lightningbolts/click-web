import 'server-only';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadSessionBootstrap } from '@/lib/server/session';
import { AppChrome } from './AppChrome';

/**
 * Server entry for the signed-in shell: one session read, one bootstrap batch. Middleware
 * already sends anonymous requests to `/login?next=…`; this redirect is the backstop.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [user, bootstrap] = await Promise.all([getServerUser(), loadSessionBootstrap()]);
  if (!user || !bootstrap) redirect('/login');
  return (
    <AppChrome user={user} bootstrap={bootstrap}>
      {children}
    </AppChrome>
  );
}
