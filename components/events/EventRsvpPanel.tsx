"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { FcButton } from "@/components/fc";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import GuestRsvpForm from "@/components/events/GuestRsvpForm";
import EventRsvpDirectory from "@/components/events/EventRsvpDirectory";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import type { ViewerEventRsvpSnapshot } from "@/lib/events/viewerEventGoing";

export type EventRsvpPayload = {
  current_user_signed_up?: boolean;
  attendees?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
};

const loadDirectory = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load RSVP");
  return res.json() as Promise<EventRsvpPayload>;
};

export default function EventRsvpPanel({
  beaconId,
  initialViewer = { kind: "unknown" },
}: {
  beaconId: string;
  initialViewer?: ViewerEventRsvpSnapshot;
}) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const memberGoing = initialViewer.kind === "member" ? initialViewer.going : null;
  const { data, isLoading } = useSWR(user ? eventRsvpKey(beaconId) : null, loadDirectory, {
    fallbackData:
      memberGoing != null ? { current_user_signed_up: memberGoing } : undefined,
    revalidateOnFocus: false,
    revalidateOnMount: true,
  });
  const going = Boolean(data?.current_user_signed_up ?? memberGoing);
  const sessionFromServer = initialViewer.kind === "member";
  const stateReady = data != null || sessionFromServer;

  const rsvp = async () => {
    setStatus("saving");
    setMessage(null);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(eventRsvpKey(beaconId), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web", platform: "web" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error || "Could not save RSVP");
        return;
      }
      await mutate(eventRsvpKey(beaconId));
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("Could not save RSVP");
    }
  };

  const cancel = async () => {
    setStatus("saving");
    setMessage(null);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(eventRsvpKey(beaconId), { method: "DELETE", headers });
      if (!res.ok) {
        setStatus("error");
        setMessage("Could not cancel RSVP");
        return;
      }
      await mutate(eventRsvpKey(beaconId));
      setStatus("idle");
    } catch {
      setStatus("error");
      setMessage("Could not cancel RSVP");
    }
  };

  if (!user && (initialViewer.kind === "guest" || !authLoading)) {
    return (
      <>
        <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
        <p className="mb-4 mt-1 text-sm text-on-surface-variant">Save a spot. No Click account needed.</p>
        <GuestRsvpForm beaconId={beaconId} />
      </>
    );
  }

  if (authLoading && !sessionFromServer) {
    return (
      <div data-testid="rsvp-status-loading">
        <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Checking your RSVP…</p>
      </div>
    );
  }

  if (!stateReady || (isLoading && data == null && !sessionFromServer)) {
    return (
      <div data-testid="account-rsvp-panel">
        <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Checking your RSVP…</p>
      </div>
    );
  }

  return (
    <div data-testid="account-rsvp-panel">
      <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
      <p className="mb-4 mt-1 text-sm text-on-surface-variant">
        {going
          ? "You're going. Your Click profile is already on the list."
          : "RSVP with this Click account. No name or email needed."}
      </p>
      {going ? (
        <FcButton type="button" variant="secondary" className="w-full" onClick={() => void cancel()} disabled={status === "saving" || !user}>
          {status === "saving" ? "Saving…" : "Cancel RSVP"}
        </FcButton>
      ) : (
        <FcButton type="button" className="w-full" onClick={() => void rsvp()} disabled={status === "saving" || !user}>
          {status === "saving" ? "Saving…" : "RSVP"}
        </FcButton>
      )}
      {message ? <p className="mt-3 text-sm text-error">{message}</p> : null}
      {going ? <EventRsvpDirectory beaconId={beaconId} /> : null}
    </div>
  );
}
