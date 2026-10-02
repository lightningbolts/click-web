"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FcCard, FcChip, FcPageShell, FcSectionHeader } from "@/components/fc";
import { useAuth } from "@/lib/AuthContext";
import { APP_CONFIG } from "@/lib/config";
import { categoryLabel } from "@/lib/places/categories";
import { placeApi, placeStatusLabel, type ManagerPlace } from "@/lib/places/managerClient";

/** /business/places — the Places the signed-in user manages (§7.2). */
export default function BusinessPlacesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [places, setPlaces] = useState<ManagerPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/business/signup?next=/business/places");
      return;
    }
    placeApi<{ places: ManagerPlace[] }>("/api/places/mine")
      .then((body) => setPlaces(body.places))
      .catch((e: Error) => setError(e.message));
  }, [loading, user, router]);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto max-w-4xl">
        <FcSectionHeader title="Your Places" subtitle="Click Places: your pin, Place page, check-ins and Pulse." />
        {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        {places == null && !error ? <p className="text-sm text-on-surface-variant">Loading…</p> : null}
        {places && places.length === 0 ? (
          <FcCard className="p-6">
            <p className="text-sm text-on-surface">
              You don&apos;t manage a Place yet. Click Places is invite-only during the pilot.{" "}
              <a
                className="font-semibold text-primary hover:underline"
                href={`mailto:${APP_CONFIG.business_contact_email}?subject=${encodeURIComponent("Click Places pilot")}`}
              >
                Contact us
              </a>
              .
            </p>
          </FcCard>
        ) : null}
        {places && places.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {places.map((place) => (
              <li key={place.id}>
                <Link href={`/business/places/${place.id}`} className="block">
                  <FcCard className="h-full space-y-2 p-5 hover:bg-surface-container-low">
                    <p className="text-lg font-bold text-on-surface">{place.name}</p>
                    <p className="text-sm text-on-surface-variant">
                      {categoryLabel(place.category)}
                      {place.city ? ` · ${place.city}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <FcChip>{placeStatusLabel(place)}</FcChip>
                      <FcChip>{place.role}</FcChip>
                    </div>
                  </FcCard>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FcPageShell>
  );
}
