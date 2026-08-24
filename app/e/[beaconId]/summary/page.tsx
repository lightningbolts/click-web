"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";

type Summary = {
  title?: string | null;
  connections_made: number;
  check_in_count: number;
  rsvp_count: number;
  density: number;
};

export default function EventPublicSummaryPage() {
  const params = useParams<{ beaconId: string }>();
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing snapshot token.");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/beacons/${params.beaconId}/summary?token=${encodeURIComponent(token)}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("This summary is not published.");
        return;
      }
      setSummary((await res.json()) as Summary);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.beaconId, token]);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <FcSectionHeader title={summary?.title?.trim() || "Event snapshot"} subtitle="Aggregate numbers only." />
        {error ? <p className="text-on-surface-variant">{error}</p> : null}
        {summary ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Connections made", summary.connections_made],
              ["Check-ins", summary.check_in_count],
              ["RSVPs", summary.rsvp_count],
              ["Density", summary.density.toFixed(2)],
            ].map(([label, value]) => (
              <FcCard key={String(label)} className="p-4">
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </FcCard>
            ))}
          </div>
        ) : null}
      </div>
    </FcPageShell>
  );
}
