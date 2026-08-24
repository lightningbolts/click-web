"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

type MutualPayload = {
  count: number;
  attendees: Array<{ user_id: string; name: string; avatar_url: string | null }>;
};

export default function MutualAttendeesTeaser({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  const [payload, setPayload] = useState<MutualPayload | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(`/api/beacons/${beaconId}/mutual-attendees`, { headers });
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as MutualPayload;
      if (!cancelled) setPayload(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [beaconId, user]);

  if (!user || !payload || payload.count < 1) return null;

  return (
    <div className="rounded-[12px] border border-border-hard bg-surface p-4" data-testid="mutual-attendees-teaser">
      <p className="text-sm font-semibold text-on-surface">
        {payload.count} {payload.count === 1 ? "person" : "people"} you know {payload.count === 1 ? "is" : "are"} going
      </p>
      <div className="mt-3 flex -space-x-2">
        {payload.attendees.slice(0, 6).map((a) =>
          a.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={a.user_id}
              src={a.avatar_url}
              alt={a.name}
              className="h-8 w-8 rounded-full border border-border-hard object-cover"
            />
          ) : (
            <span
              key={a.user_id}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border-hard bg-surface-container text-xs font-bold text-on-surface"
            >
              {a.name.slice(0, 1).toUpperCase()}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
