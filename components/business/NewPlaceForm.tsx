'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { Chip } from '@/components/ds/Chip';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { TextField } from '@/components/ds/TextField';
import { TitleInput } from '@/components/ds/TextField';
import { authedJson } from '@/lib/api/authedJson';
import { PLACE_CATEGORIES, categoryLabel } from '@/lib/places/categories';
import type { PlaceCategory } from '@/lib/places/types';
import type { ManagerPlace } from '@/lib/server/places/serialize';

const PinMap = dynamic(() => import('@/components/maps/PinMap'), {
  ssr: false,
  loading: () => <div className="h-[200px] rounded-lg bg-surface-raised" />,
});

type Spot = { label: string; lat: number; lng: number };

/** Normalizes "bluedoor.cafe" to an https URL the API accepts. */
export function normalizeWebsite(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v.replace(/^http:\/\//i, 'https://') : `https://${v}`;
}

/**
 * Create a Place (spec §9.6 step 2): name, kind, a geocoded address with a pin you can drag, and an
 * optional website. It's created pending with you as owner; Click verifies it before it's listed.
 */
export function NewPlaceForm({ onCreated }: { onCreated: (place: ManagerPlace) => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Spot[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Address search as you type (debounced; the geocoder is rate-limited).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || spot) return;
    const timer = setTimeout(() => {
      fetch(`/api/geo/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((body: { results?: Spot[] }) => setResults((body.results ?? []).slice(0, 5)))
        .catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, spot]);

  const choose = (picked: Spot) => {
    setSpot(picked);
    setQuery(picked.label);
    setResults([]);
    // Geocoder labels vary by country, so the address is a starting point to edit, not parsed.
    if (!street) setStreet(picked.label.slice(0, 200));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Your browser can’t share its location. Search for the address instead.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const fallback = { label: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`, lat: coords.latitude, lng: coords.longitude };
        try {
          const res = await fetch(`/api/geo/reverse?lat=${coords.latitude}&lng=${coords.longitude}`);
          const body = (await res.json()) as { result?: Spot | null };
          choose(body.result ? { ...body.result, lat: coords.latitude, lng: coords.longitude } : fallback);
        } catch {
          choose(fallback);
        }
      },
      () => setError('Couldn’t get your location. Search for the address instead.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const ready = name.trim().length >= 2 && category && spot && city.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !spot || !category) return;
    setBusy(true);
    setError(null);
    try {
      const { place } = await authedJson<{ place: ManagerPlace }>('/api/places', {
        method: 'POST',
        body: {
          name: name.trim(),
          category,
          latitude: spot.lat,
          longitude: spot.lng,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          address_line: street.trim() || undefined,
          city: city.trim(),
          website_url: normalizeWebsite(website),
        },
        fallback: 'Couldn’t set up your Place.',
      });
      onCreated(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t set up your Place.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <section className="flex flex-col gap-4" aria-labelledby="new-place-what">
        <h2 id="new-place-what" className="type-headline text-fg">
          What is it?
        </h2>
        <TitleInput value={name} maxLength={120} placeholder="Place name" aria-label="Place name" onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend className="type-meta mb-2 font-semibold text-fg-secondary">Kind of place</legend>
          <div className="flex flex-wrap gap-2">
            {PLACE_CATEGORIES.map((c) => (
              <Chip key={c} selected={category === c} showCheck onClick={() => setCategory(c)}>
                {categoryLabel(c)}
              </Chip>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="new-place-where">
        <h2 id="new-place-where" className="type-headline text-fg">
          Where is it?
        </h2>
        <div className="relative">
          <TextField
            label="Address"
            value={query}
            placeholder="12 Pike St, Seattle"
            onChange={(e) => {
              setQuery(e.target.value);
              setSpot(null);
            }}
            aria-autocomplete="list"
            aria-controls="new-place-results"
          />
          {!spot && query.trim().length >= 3 && results.length > 0 ? (
            <ul id="new-place-results" role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md bg-bg-elevated p-1.5 shadow-overlay">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`} role="option" aria-selected={false}>
                  <button type="button" onClick={() => choose(r)} className="type-body w-full rounded-sm px-3 py-2 text-left text-fg hover:bg-hover">
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button variant="plain" size="sm" icon={LocateFixed} onClick={useMyLocation} className="-ml-3 self-start">
          I’m there now: use my location
        </Button>
        {spot ? (
          <div>
            <PinMap
              markers={[{ id: 'new-place', lat: spot.lat, lng: spot.lng, label: name || 'Your Place' }]}
              className="h-[200px] rounded-lg border-0"
              onPinMove={(_id, lat, lng) => setSpot((s) => (s ? { ...s, lat, lng } : s))}
            />
            <p className="type-meta mt-1.5 text-fg-tertiary">Drag the pin onto your door. Check-ins count within the radius Click sets.</p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Street address" value={street} maxLength={200} onChange={(e) => setStreet(e.target.value)} />
          <TextField label="City" value={city} maxLength={100} required onChange={(e) => setCity(e.target.value)} />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="new-place-web">
        <h2 id="new-place-web" className="type-headline text-fg">
          Website <span className="type-body font-normal text-fg-tertiary">(optional)</span>
        </h2>
        <TextField label="Website" hideLabel value={website} placeholder="bluedoor.cafe" onChange={(e) => setWebsite(e.target.value)} />
      </section>

      <p className="type-meta text-fg-secondary">
        Click reviews every Place before it shows on the map, usually within one business day. Add photos, hours and a description
        meanwhile. Private homes, clinics, places of worship, K–12 schools and public parks can’t be Places.
      </p>
      {error ? <InlineNotice variant="destructive">{error}</InlineNotice> : null}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!ready} className="self-start">
        Set up my Place
      </Button>
    </form>
  );
}
