import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/server/supabaseServer';
import { isAdminUser } from '@/lib/server/adminRole';

export const metadata: Metadata = {
  title: 'Click Admin Dashboard',
  description: 'Internal trust, safety, insights, and operations console for Click.',
};

async function requireAdminRole(): Promise<{ email: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/');
  }

  if (!isAdminUser(user)) {
    redirect('/');
  }

  return {
    email: user.email ?? 'admin@click',
  };
}

export default async function AdminRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireAdminRole();

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10">
      <div className="grid flex-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="glass-panel h-fit rounded-2xl p-5 lg:sticky lg:top-4">
          <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">Internal</p>
          <h1 className="mt-2 text-xl font-semibold text-white">Click Admin Dashboard</h1>
          <p className="mt-1 text-xs text-zinc-400">Signed in as {session.email}</p>

          <nav className="mt-6 space-y-2 text-sm">
            <Link href="/admin#trust-safety" className="block rounded-lg px-3 py-2 text-on-surface hover:bg-zinc-800">
              Trust &amp; Safety
            </Link>
            <Link href="/admin#click-insights" className="block rounded-lg px-3 py-2 text-on-surface hover:bg-zinc-800">
              Click Insights
            </Link>
            <Link href="/admin#system-health" className="block rounded-lg px-3 py-2 text-on-surface hover:bg-zinc-800">
              System Health
            </Link>
          </nav>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300">
            This dashboard only processes metadata and consent-forwarded content to preserve E2EE boundaries.
          </div>
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
