import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { GetStarted } from '@/components/business/GetStarted';
import { BIZ_PLACE_COOKIE, resolveBusinessPlace } from '@/lib/places/workspace';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadManagedPlaces } from '@/lib/server/places/workspace';

export const metadata: Metadata = {
  title: 'Set up your Place · Click for Business',
  description: 'Put your café, bar, gym or campus space on Click. Free to set up.',
};

/** Onboarding (spec §9.6): reachable signed out; free; never asks for payment. */
export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [user, sp, jar] = await Promise.all([getServerUser(), searchParams, cookies()]);
  const places = user ? await loadManagedPlaces(user.id) : [];
  const lastId = resolveBusinessPlace(places, jar.get(BIZ_PLACE_COOKIE)?.value);
  const last = places.find((p) => p.id === lastId) ?? null;
  const checkout = sp.checkout === 'success' || sp.checkout === 'canceled' ? sp.checkout : null;
  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <h1 className="type-title-1 text-fg">Put your Place on Click</h1>
      <p className="type-body mb-10 mt-1 max-w-[56ch] text-fg-secondary">
        A pin on the map, a Place page, check-ins and a home for your events. Free to set up; Insights are an optional upgrade
        per Place.
      </p>
      <GetStarted signedIn={Boolean(user)} managed={places.length} lastPlace={last ? { id: last.id, name: last.name } : null} checkout={checkout} />
    </div>
  );
}
