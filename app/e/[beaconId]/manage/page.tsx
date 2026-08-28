"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";
import { eventShareUrl } from "@/lib/events/eventUrls";
import GuestListUploadCard from "@/components/events/GuestListUploadCard";
import EventPageShell from "@/components/events/EventPageShell";
import EventRsvpRequestsCard from "@/components/events/EventRsvpRequestsCard";

type GuestRow = { id: string; name: string; contact: string; created_at: string };
type Health = {
  connections_made: number;
  check_in_count: number;
  rsvp_count: number;
  density: number;
  repeat_reconnect_count: number;
  new_pair_count: number;
};

export default function EventManagePage() {
  const params = useParams<{ beaconId: string }>();
  const beaconId = params.beaconId;
  const { user } = useAuth();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [summaryPath, setSummaryPath] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !beaconId) return;
    let cancelled = false;
    (async () => {
      const headers = await getFreshAuthHeaders();
      const [gRes, hRes] = await Promise.all([
        fetch(`/api/beacons/${beaconId}/rsvp/guests`, { headers }),
        fetch(`/api/beacons/${beaconId}/network-health`, { headers }),
      ]);
      if (cancelled) return;
      if (!gRes.ok || !hRes.ok) {
        setError("You need to be the organizer to manage this event.");
        return;
      }
      const gJson = (await gRes.json()) as { guests?: GuestRow[] };
      const hJson = (await hRes.json()) as Health;
      setGuests(gJson.guests ?? []);
      setHealth(hJson);
    })();
    return () => {
      cancelled = true;
    };
  }, [beaconId, user]);

  const share = typeof window !== "undefined" ? eventShareUrl(beaconId, window.location.origin) : "";

  const publish = async () => {
    const headers = await getFreshAuthHeaders();
    const res = await fetch(`/api/beacons/${beaconId}/summary/publish`, { method: "POST", headers });
    const json = (await res.json()) as { summary_path?: string };
    if (json.summary_path) setSummaryPath(json.summary_path);
  };

  return (
    <EventPageShell className="py-10">
      <div className="space-y-6">
        <FcSectionHeader title="Event manage" subtitle="Organizer metrics, guest list, and Seed a Room." />
        {error ? <p className="text-error">{error}</p> : null}
        <GuestListUploadCard beaconId={beaconId} />
        <EventRsvpRequestsCard beaconId={beaconId} />
        <FcCard className="flex flex-wrap items-center gap-3 p-4">
          <code className="break-all text-xs text-on-surface-variant">{share}</code>
          <FcButton
            type="button"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(share);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </FcButton>
          <FcButton type="button" variant="secondary" onClick={() => void publish()}>
            Publish summary
          </FcButton>
          {summaryPath ? (
            <a href={summaryPath} className="text-sm font-semibold text-primary hover:underline">
              Open snapshot
            </a>
          ) : null}
        </FcCard>
        {health ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Connections made", health.connections_made],
              ["Check-ins", health.check_in_count],
              ["RSVPs", health.rsvp_count],
              ["Density", health.density.toFixed(2)],
              ["Repeat reconnects", health.repeat_reconnect_count],
              ["New pairs", health.new_pair_count],
            ].map(([label, value]) => (
              <FcCard key={String(label)} className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{value}</p>
              </FcCard>
            ))}
          </div>
        ) : null}
        <FcCard className="p-4">
          <h2 className="mb-3 text-lg font-bold">Guest RSVPs</h2>
          {guests.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No guest RSVPs yet.</p>
          ) : (
            <ul className="divide-y divide-border-hard">
              {guests.map((g) => (
                <li key={g.id} className="py-2">
                  <p className="font-medium text-on-surface">{g.name}</p>
                  <p className="text-sm text-on-surface-variant">{g.contact}</p>
                </li>
              ))}
            </ul>
          )}
        </FcCard>
      </div>
    </EventPageShell>
  );
}
