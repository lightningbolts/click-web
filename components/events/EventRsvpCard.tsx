"use client";

import {
  CalendarCheck,
  CalendarX2,
  Check,
  Clock,
  Hourglass,
  Lock,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { AvatarStack } from "@/components/ds/Avatar";
import { Button } from "@/components/ds/Button";
import { cardClassName } from "@/components/ds/Card";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ds/Menu";
import { Skeleton } from "@/components/ds/Skeleton";
import { toast } from "@/components/ds/Toast";
import { CalendarMenuItems, EventCalendarMenu } from "@/components/events/EventCalendarMenu";
import { EventPassLink } from "@/components/events/EventPassLink";
import { shareEventLink } from "@/components/events/EventShareButton";
import GuestRsvpForm from "@/components/events/GuestRsvpForm";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import type { CalendarEvent } from "@/lib/events/calendarLinks";
import type { EventListingOptions } from "@/lib/events/eventOptions";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import {
  applyCancelOptimistic,
  applyRsvpOptimistic,
  fetchEventRsvpPayload,
  type EventRsvpPayload,
} from "@/lib/events/eventRsvpClient";
import { eventAtCapacity, resolveRsvpState, type RsvpState } from "@/lib/events/rsvpState";
import type { ViewerEventRsvpSnapshot } from "@/lib/events/viewerEventGoing";
import { cn } from "@/lib/cn";

type Person = { user_id?: string | null; name: string; avatar_url?: string | null };

const ROW: Partial<Record<RsvpState, { icon: LucideIcon; title: string; detail?: string; tone?: "accent" }>> = {
  approval: { icon: ShieldCheck, title: "Approval required", detail: "Your request is reviewed by the host." },
  going: { icon: CalendarCheck, title: "You’re going", tone: "accent" },
  requested: { icon: Clock, title: "Request sent", detail: "The host is reviewing it. We’ll let you know." },
  waitlist: { icon: Hourglass, title: "You’re on the waitlist", detail: "You’re in if a spot opens." },
  full: { icon: Users, title: "This event is full" },
  ended: { icon: CalendarX2, title: "This event has ended" },
  closed: { icon: Lock, title: "Registration closed", detail: "The host isn’t taking RSVPs right now." },
};

/**
 * The Registration card (spec §7.6.2): one state row and one primary action for every
 * RSVP state, resolved by `resolveRsvpState`. Shares the `eventRsvpKey` SWR cache with the
 * guest list and event chat, so RSVPing updates them without a reload.
 */
export function EventRsvpCard({
  beaconId,
  title,
  initialViewer = { kind: "unknown" },
  listing,
  rsvpEnabled,
  ended,
  count,
  people,
  calendar,
  shareUrl,
  checkedIn = false,
}: {
  beaconId: string;
  title: string;
  initialViewer?: ViewerEventRsvpSnapshot;
  listing: EventListingOptions;
  rsvpEnabled: boolean;
  ended: boolean;
  count: number;
  /** Public guest list preview; empty when the list is hidden. */
  people: Person[];
  calendar: CalendarEvent;
  shareUrl: string;
  /** Checked in at the door, as the server saw it. */
  checkedIn?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [saving, setSaving] = useState(false);
  const serverMember = initialViewer.kind === "member" ? initialViewer : null;
  const key = eventRsvpKey(beaconId);
  const { data } = useSWR<EventRsvpPayload>(user ? key : null, fetchEventRsvpPayload, {
    fallbackData: serverMember
      ? { current_user_signed_up: serverMember.going, request_status: serverMember.request_status === "denied" ? null : serverMember.request_status }
      : undefined,
    revalidateOnFocus: false,
  });

  // Server knowledge wins while the client session is still loading, so nothing flashes.
  const signedIn: boolean | null = user
    ? true
    : initialViewer.kind === "guest" || (!authLoading && initialViewer.kind !== "member")
      ? false
      : serverMember
        ? true
        : null;
  const known = !user || data != null || serverMember != null;
  const liveCount = data?.rsvp_count ?? count;
  const livePeople: Person[] = data?.attendees?.length ? data.attendees : people;
  const state = resolveRsvpState({
    signedIn: known ? signedIn : null,
    going: Boolean(data?.current_user_signed_up ?? serverMember?.going),
    requestStatus: data?.request_status ?? serverMember?.request_status,
    rsvpEnabled,
    approvalRequired: listing.approval_required,
    atCapacity: eventAtCapacity(listing.event_capacity, liveCount),
    ended,
  });

  const rsvp = async () => {
    setSaving(true);
    try {
      const res = await fetch(key, {
        method: "POST",
        headers: { ...(await getFreshAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web", platform: "web" }),
      });
      const json = (await res.json()) as {
        error?: string;
        request_status?: "pending" | "waitlisted";
        attendee?: { user_id: string; name: string; avatar_url: string | null };
      };
      if (!res.ok) {
        toast.error(json.error || "Couldn’t save your RSVP.");
        return;
      }
      if (json.request_status) {
        const status = json.request_status;
        await mutate(key, (cur: EventRsvpPayload | undefined) => ({ ...cur, request_status: status }), { revalidate: true });
      } else if (json.attendee) {
        const attendee = json.attendee;
        await mutate(key, (cur: EventRsvpPayload | undefined) => applyRsvpOptimistic(cur, attendee), { revalidate: true });
      } else {
        await mutate(key);
      }
    } catch {
      toast.error("Couldn’t save your RSVP.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    setSaving(true);
    try {
      const res = await fetch(key, { method: "DELETE", headers: await getFreshAuthHeaders() });
      if (!res.ok) {
        toast.error(state === "going" ? "Couldn’t cancel your RSVP." : "Couldn’t withdraw your request.");
        return;
      }
      await mutate(
        key,
        (cur: EventRsvpPayload | undefined) =>
          user ? { ...applyCancelOptimistic(cur, user.id), request_status: null } : cur,
        { revalidate: true },
      );
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const row = ROW[state];
  const loginHref = `/login?next=${encodeURIComponent(`/e/${beaconId}`)}`;

  let action: React.ReactNode = null;
  switch (state) {
    case "loading":
      action = <Skeleton rounded="full" className="h-12 w-full" />;
      break;
    case "guest":
      action = (
        <>
          <GuestRsvpForm beaconId={beaconId} />
          <Button href={loginHref} variant="plain" size="sm" className="mt-1 self-center">
            Have an account? Log in
          </Button>
        </>
      );
      break;
    case "open":
    case "approval":
      action = (
        <Button variant="primary" size="lg" fullWidth loading={saving} onClick={() => void rsvp()}>
          {state === "approval" ? "Request to join" : "RSVP"}
        </Button>
      );
      break;
    case "going":
      action = (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="tinted" size="lg" fullWidth loading={saving} trailingIcon={Check}>
              You’re going
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="min-w-56">
            <MenuSub>
              <MenuSubTrigger icon={CalendarCheck}>Add to calendar</MenuSubTrigger>
              <MenuSubContent>
                <CalendarMenuItems event={calendar} />
              </MenuSubContent>
            </MenuSub>
            <MenuItem onSelect={() => void shareEventLink(shareUrl, title)}>Share</MenuItem>
            {rsvpEnabled ? (
              <>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => void cancel()}>
                  Can’t go
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </Menu>
      );
      break;
    case "requested":
    case "waitlist":
      action = (
        <div className="flex items-center gap-2">
          <Button variant="tinted" size="lg" disabled className="flex-1">
            {state === "requested" ? "Request sent" : "On the waitlist"}
          </Button>
          <Button variant="plain" size="lg" loading={saving} onClick={() => void cancel()}>
            {state === "requested" ? "Withdraw" : "Leave"}
          </Button>
        </div>
      );
      break;
    case "full":
      // Members join the waitlist (the RSVP API waitlists when full); guests need an account.
      action = signedIn ? (
        <Button variant="secondary" size="lg" fullWidth loading={saving} onClick={() => void rsvp()}>
          Join waitlist
        </Button>
      ) : (
        <Button href={loginHref} variant="secondary" size="lg" fullWidth>
          Log in to join the waitlist
        </Button>
      );
      break;
    case "ended":
      action = (
        <Button href={`/e/${beaconId}/recap`} variant="secondary" size="lg" fullWidth>
          See recap
        </Button>
      );
      break;
    case "closed":
      break;
  }

  return (
    <section
      aria-labelledby="rsvp-heading"
      className={cardClassName({ className: "rounded-xl" })}
      data-testid={`rsvp-state-${state}`}
    >
      <h2 id="rsvp-heading" className="type-meta mb-3 font-semibold text-fg-secondary">
        Registration
      </h2>
      {row ? (
        <div className="mb-4 flex items-center gap-3" aria-live="polite">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-sm",
              row.tone === "accent" ? "bg-selection text-accent" : "bg-surface-raised text-fg-secondary",
            )}
          >
            <row.icon size={20} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="type-body-strong text-fg">{row.title}</p>
            {state === "going" ? (
              <EventCalendarMenu
                event={calendar}
                trigger={
                  <button type="button" className="type-meta text-accent hover:underline">
                    Add it to your calendar
                  </button>
                }
              />
            ) : row.detail ? (
              <p className="type-meta text-fg-secondary">{row.detail}</p>
            ) : null}
          </div>
        </div>
      ) : state === "open" ? (
        <p className="type-meta mb-4 text-fg-secondary">RSVP with your Click account. The host sees your name.</p>
      ) : state === "guest" ? (
        <p className="type-meta mb-4 text-fg-secondary">Save a spot. No Click account needed.</p>
      ) : null}
      <div className="flex flex-col">{action}</div>
      {state === "going" ? <EventPassLink beaconId={beaconId} checkedIn={checkedIn} /> : null}
      {liveCount > 0 ? (
        <div className="type-meta tabular mt-4 flex items-center gap-2 text-fg-secondary">
          {livePeople.length ? (
            <AvatarStack
              size={24}
              total={liveCount}
              people={livePeople.slice(0, 3).map((p, i) => ({ seed: p.user_id || `${p.name}-${i}`, name: p.name, src: p.avatar_url }))}
            />
          ) : null}
          {liveCount} {ended ? "went" : "going"}
          {listing.event_capacity != null && !ended ? <span className="text-fg-tertiary">· {listing.event_capacity} spots</span> : null}
        </div>
      ) : null}
    </section>
  );
}
