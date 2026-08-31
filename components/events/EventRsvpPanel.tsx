"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { FcButton } from "@/components/fc";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import GuestRsvpForm from "@/components/events/GuestRsvpForm";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import {
  applyCancelOptimistic,
  applyRsvpOptimistic,
  fetchEventRsvpPayload,
  type EventRsvpPayload,
} from "@/lib/events/eventRsvpClient";
import type { ViewerEventRsvpSnapshot } from "@/lib/events/viewerEventGoing";
import type { EventListingOptions } from "@/lib/events/eventOptions";

export default function EventRsvpPanel({
  beaconId,
  initialViewer = { kind: "unknown" },
  listing,
  eventEnded = false,
}: {
  beaconId: string;
  initialViewer?: ViewerEventRsvpSnapshot;
  listing?: EventListingOptions;
  eventEnded?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const memberGoing = initialViewer.kind === "member" ? initialViewer.going : null;
  const { data, isLoading } = useSWR(user ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload, {
    fallbackData:
      memberGoing != null ? { current_user_signed_up: memberGoing } : undefined,
    revalidateOnFocus: false,
    revalidateOnMount: true,
  });
  const going = Boolean(data?.current_user_signed_up ?? memberGoing);
  const requestStatus =
    data?.request_status ??
    (initialViewer.kind === "member" ? initialViewer.request_status : null);
  const sessionFromServer = initialViewer.kind === "member";
  const stateReady = data != null || sessionFromServer;
  const cacheKey = eventRsvpKey(beaconId);

  const rsvp = async () => {
    setStatus("saving");
    setMessage(null);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(cacheKey, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web", platform: "web" }),
      });
      const json = (await res.json()) as {
        error?: string;
        request_status?: "pending" | "waitlisted";
        attendee?: { user_id: string; name: string; avatar_url: string | null };
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error || "Could not save RSVP");
        return;
      }
      if (json.request_status === "pending" || json.request_status === "waitlisted") {
        await mutate(
          cacheKey,
          (current: EventRsvpPayload | undefined) => ({
            ...current,
            request_status: json.request_status,
          }),
          { revalidate: true },
        );
      } else if (json.attendee) {
        await mutate(
          cacheKey,
          (current: EventRsvpPayload | undefined) => applyRsvpOptimistic(current, json.attendee!),
          { revalidate: true },
        );
      } else {
        await mutate(cacheKey);
      }
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
      const res = await fetch(cacheKey, { method: "DELETE", headers });
      if (!res.ok) {
        setStatus("error");
        setMessage("Could not cancel RSVP");
        return;
      }
      await mutate(
        cacheKey,
        (current: EventRsvpPayload | undefined) =>
          user ? applyCancelOptimistic(current, user.id) : current,
        { revalidate: true },
      );
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

  if (eventEnded) {
    return (
      <div data-testid="account-rsvp-panel">
        <h2 className="text-lg font-bold text-on-surface">This event has ended</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Open in Click for recap and connections.</p>
      </div>
    );
  }

  if (going) {
    return (
      <div data-testid="event-state-going">
        <h2 className="text-lg font-bold text-on-surface">You&apos;re going</h2>
        <p className="mb-4 mt-1 text-sm text-on-surface-variant">
          Your Click profile is on the guest list.
        </p>
        <FcButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void cancel()}
          disabled={status === "saving" || !user}
        >
          {status === "saving" ? "Saving…" : "Cancel RSVP"}
        </FcButton>
        {message ? <p className="mt-3 text-sm text-error">{message}</p> : null}
      </div>
    );
  }

  if (requestStatus === "pending") {
    return (
      <div data-testid="event-state-pending">
        <h2 className="text-lg font-bold text-on-surface">Approval pending</h2>
        <p className="mb-4 mt-1 text-sm text-on-surface-variant">The host is reviewing your request.</p>
        <FcButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void cancel()}
          disabled={status === "saving" || !user}
        >
          {status === "saving" ? "Saving…" : "Withdraw request"}
        </FcButton>
        {message ? <p className="mt-3 text-sm text-error">{message}</p> : null}
      </div>
    );
  }

  if (requestStatus === "waitlisted") {
    return (
      <div data-testid="event-state-full">
        <h2 className="text-lg font-bold text-on-surface">You&apos;re on the waitlist</h2>
        <p className="mb-4 mt-1 text-sm text-on-surface-variant">We&apos;ll confirm you if a spot opens.</p>
        <FcButton
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => void cancel()}
          disabled={status === "saving" || !user}
        >
          {status === "saving" ? "Saving…" : "Withdraw request"}
        </FcButton>
        {message ? <p className="mt-3 text-sm text-error">{message}</p> : null}
      </div>
    );
  }

  const ctaLabel = listing?.approval_required ? "Request to join" : "RSVP";
  const helper = listing?.approval_required
    ? "The host approves guests before they join."
    : "RSVP with this Click account. No name or email needed.";

  return (
    <div data-testid="account-rsvp-panel">
      <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
      <p className="mb-4 mt-1 text-sm text-on-surface-variant">{helper}</p>
      <FcButton type="button" className="w-full" onClick={() => void rsvp()} disabled={status === "saving" || !user}>
        {status === "saving" ? "Saving…" : ctaLabel}
      </FcButton>
      {message ? <p className="mt-3 text-sm text-error">{message}</p> : null}
    </div>
  );
}
