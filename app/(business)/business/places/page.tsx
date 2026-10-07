import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { StatusPill } from '@/components/ds/StatusPill';
import { categoryLabel } from '@/lib/places/categories';
import { placeStatusPill } from '@/lib/places/workspace';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadManagedPlaces } from '@/lib/server/places/workspace';
import { loginHref } from '@/lib/shell/appNav';

export const metadata: Metadata = { title: 'Your Places · Business · Click', robots: { index: false } };

const ROLE = { owner: 'Owner', manager: 'Manager', viewer: 'Viewer' } as const;

/** Every Place you manage (spec §9.2), as cards. None yet → onboarding. */
export default async function BusinessPlacesPage() {
  const user = await getServerUser();
  if (!user) redirect(loginHref('/business/places'));
  const places = await loadManagedPlaces(user.id);
  if (places.length === 0) redirect('/business/get-started');

  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title-1 text-fg">Your Places</h1>
          <p className="type-body mt-1 text-fg-secondary">Click for Business: your pin, Place page, check-ins and events.</p>
        </div>
        <Button variant="primary" icon={Plus} href="/business/places/new">
          Add a Place
        </Button>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => {
          const status = placeStatusPill(p);
          return (
            <li key={p.id}>
              <Link
                href={`/business/places/${p.id}`}
                className="group block overflow-hidden rounded-lg bg-surface transition-colors hover:bg-[color-mix(in_srgb,var(--surface)_92%,var(--text)_8%)] dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
              >
                <CardVisual seed={p.id} photoUrl={p.photo_url} ratio="16:9" radius={0} sizes="(max-width: 640px) 100vw, 400px" />
                <div className="p-4">
                  <p className="type-headline truncate text-fg group-hover:underline">{p.name}</p>
                  <p className="type-meta mt-0.5 text-fg-tertiary">{[p.category ? categoryLabel(p.category) : null, p.city].filter(Boolean).join(' · ') || ' '}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <StatusPill variant={status.variant}>{status.label}</StatusPill>
                    <StatusPill variant="neutral">{ROLE[p.role]}</StatusPill>
                    {p.entitled ? <StatusPill variant="tinted">Click for Business</StatusPill> : null}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
