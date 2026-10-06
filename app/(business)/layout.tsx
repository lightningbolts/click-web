import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { getServerUser } from '@/lib/server/getServerUser';

/**
 * Business (spec §9.1.4): the same signed-in shell as the rest of the app. Only
 * `/business/get-started` is reachable signed out, where the static site chrome shows instead.
 */
export default async function BusinessGroupLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  return user ? <AppShell>{children}</AppShell> : <>{children}</>;
}
