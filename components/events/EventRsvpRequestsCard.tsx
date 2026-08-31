"use client";

import useSWR, { mutate } from "swr";
import { FcButton, FcCard } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { useState } from "react";

type RequestRow = {
  user_id: string;
  status: string;
  created_at: string;
};

async function loadRequests(url: string) {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Could not load RSVP requests.");
  return res.json() as Promise<{ requests?: RequestRow[] }>;
}

export default function EventRsvpRequestsCard({ beaconId }: { beaconId: string }) {
  const key = `/api/beacons/${beaconId}/rsvp/requests`;
  const { data, error } = useSWR(beaconId ? key : null, loadRequests, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const rows = data?.requests ?? [];

  const act = async (userId: string, action: "approve" | "deny") => {
    setBusy(`${userId}:${action}`);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(key, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action }),
      });
      if (!res.ok) return;
      await mutate(key);
    } finally {
      setBusy(null);
    }
  };

  return (
    <FcCard className="p-4" data-testid="event-rsvp-requests">
      <h2 className="mb-3 text-lg font-bold">RSVP requests</h2>
      {error ? <p className="mb-2 text-sm text-error">Could not load RSVP requests.</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No pending or waitlisted Click RSVPs.</p>
      ) : (
        <ul className="divide-y divide-border-hard">
          {rows.map((row) => (
            <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-on-surface">{row.user_id}</p>
                <p className="text-xs uppercase tracking-wide text-on-surface-variant">{row.status}</p>
              </div>
              <div className="flex gap-2">
                <FcButton
                  type="button"
                  disabled={busy != null}
                  onClick={() => void act(row.user_id, "approve")}
                >
                  {busy === `${row.user_id}:approve` ? "Saving…" : "Approve"}
                </FcButton>
                <FcButton
                  type="button"
                  variant="secondary"
                  disabled={busy != null}
                  onClick={() => void act(row.user_id, "deny")}
                >
                  Deny
                </FcButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FcCard>
  );
}
