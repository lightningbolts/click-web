"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FcButton, FcCard, FcField, FcInput, FcPageShell, FcSectionHeader } from "@/components/fc";
import { useAuth } from "@/lib/AuthContext";
import { PLACE_CATEGORIES, categoryLabel } from "@/lib/places/categories";
import { placeApi, type ManagerPlace } from "@/lib/places/managerClient";
import type { PlaceCategory } from "@/lib/places/types";

type Spot = { label: string; lat: number; lng: number };

/**
 * /business/places/new — a business sets up its Place in one screen: what it is, where it is,
 * and an optional website. It's created pending with the business as owner; Click verifies it
 * before it goes on the map, and the business finishes its profile meanwhile.
 */
export default function NewPlacePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Spot[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/business/signup?next=/business/places/new");
  }, [loading, user, router]);

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
    if (!navigator.geolocation) return setError("Your browser can't share its location. Search for the address instead.");
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
      () => setError("Couldn't get your location. Search for the address instead."),
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
      const { place } = await placeApi<{ place: ManagerPlace }>("/api/places", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          category,
          latitude: spot.lat,
          longitude: spot.lng,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          address_line: street.trim() || undefined,
          city: city.trim(),
          website_url: website.trim() ? (website.trim().startsWith("http") ? website.trim() : `https://${website.trim()}`) : undefined,
        }),
      });
      router.push(`/business/places/${place.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <form className="mx-auto max-w-2xl space-y-6" onSubmit={submit}>
        <Link href="/business/places" className="text-sm font-semibold text-primary hover:underline">
          ← Your Places
        </Link>
        <FcSectionHeader
          title="Set up your Place"
          subtitle="Restaurants, cafés, bars, event spaces, gyms, offices, campus spaces: any physical spot people visit. Your Place gets a pin on the Click map, a Place page, check-ins, a live Pulse, and a home for the events you host."
        />

        <FcCard className="space-y-4 p-6">
          <p className="text-lg font-bold text-on-surface">1. What is it?</p>
          <FcField label="Name">
            <FcInput value={name} maxLength={120} required placeholder="Blue Door Café" onChange={(e) => setName(e.target.value)} />
          </FcField>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-on-surface">Kind of place</legend>
            <div className="flex flex-wrap gap-2">
              {PLACE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border-2 border-border-hard px-3 py-1.5 text-sm font-semibold ${
                    category === c ? "bg-primary text-on-primary" : "bg-surface text-on-surface hover:bg-surface-container-low"
                  }`}
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          </fieldset>
        </FcCard>

        <FcCard className="space-y-4 p-6">
          <p className="text-lg font-bold text-on-surface">2. Where is it?</p>
          <FcField label="Search for the address">
            <FcInput
              value={query}
              placeholder="12 Pike St, Seattle"
              onChange={(e) => {
                setQuery(e.target.value);
                setSpot(null);
              }}
              aria-autocomplete="list"
            />
          </FcField>
          {!spot && query.trim().length >= 3 && results.length > 0 ? (
            <ul className="divide-y divide-border-hard/20 rounded-[8px] border border-border-hard/40" role="listbox">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button type="button" onClick={() => choose(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-container-low">
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" onClick={useMyLocation} className="text-sm font-semibold text-primary hover:underline">
            I&apos;m there now: use my location
          </button>
          {spot ? (
            <p className="text-sm text-on-surface">
              📍 Pinned at {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)} ·{" "}
              <a
                href={`https://maps.apple.com/?ll=${spot.lat},${spot.lng}&q=${encodeURIComponent(name || "Place")}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                Check on a map
              </a>
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FcField label="Street address">
              <FcInput value={street} maxLength={200} onChange={(e) => setStreet(e.target.value)} />
            </FcField>
            <FcField label="City">
              <FcInput value={city} maxLength={100} required onChange={(e) => setCity(e.target.value)} />
            </FcField>
          </div>
        </FcCard>

        <FcCard className="space-y-4 p-6">
          <p className="text-lg font-bold text-on-surface">3. Website (optional)</p>
          <FcInput value={website} placeholder="bluedoor.cafe" onChange={(e) => setWebsite(e.target.value)} />
        </FcCard>

        <p className="text-sm text-on-surface-variant">
          Click verifies every Place before it appears on the map, usually within one business day. You can add photos, hours and a
          description while we review. Private homes, clinics, places of worship, K–12 schools and public parks can&apos;t be Places.
        </p>
        {error ? <p className="text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
        <FcButton type="submit" disabled={!ready || busy}>
          {busy ? "Setting up…" : "Set up my Place"}
        </FcButton>
      </form>
    </FcPageShell>
  );
}
