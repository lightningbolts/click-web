import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { getServerUser } from '@/lib/server/getServerUser';

/**
 * Signed-in app routes (spec §6): one server shell, bars complete on first paint. Home, the
 * tabs and Events share this one layout, so moving between them never rebuilds the bars.
 * Anonymous visitors reach only the public routes here (marketing `/`, `/events`, `/e/*`;
 * middleware sends the rest to log in) and get the static site chrome instead.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  return user ? <AppShell>{children}</AppShell> : <>{children}</>;
}
