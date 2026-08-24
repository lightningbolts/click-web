"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";

type Person = { user_id: string; name: string; avatar_url: string | null; connection_id: string };

export default function EventRecapPage() {
  const params = useParams<{ beaconId: string }>();
  const beaconId = params.beaconId;
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !beaconId) return;
    let cancelled = false;
    (async () => {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(`/api/beacons/${beaconId}/recap`, { headers });
      if (cancelled) return;
      if (!res.ok) {
        setError("Recap is available after you RSVP or check in.");
        return;
      }
      const json = (await res.json()) as { people?: Person[] };
      setPeople(json.people ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [beaconId, user]);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <FcSectionHeader title="Event recap" subtitle="People you connected with at this event." />
        {error ? <p className="text-on-surface-variant">{error}</p> : null}
        {people && people.length === 0 ? (
          <p className="text-on-surface-variant">No attributed connections from this event yet.</p>
        ) : null}
        <div className="space-y-3">
          {(people ?? []).map((p) => (
            <FcCard key={p.connection_id} className="flex items-center gap-3 p-4">
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container font-bold">
                  {p.name.slice(0, 1)}
                </span>
              )}
              <p className="font-semibold text-on-surface">{p.name}</p>
            </FcCard>
          ))}
        </div>
      </div>
    </FcPageShell>
  );
}
