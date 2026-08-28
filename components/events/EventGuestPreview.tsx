"use client";

import { useState } from "react";
import EventGoingAvatars, { type EventGoingPerson } from "@/components/events/EventGoingAvatars";
import EventRsvpDirectory from "@/components/events/EventRsvpDirectory";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { useAuth } from "@/lib/AuthContext";
import type { EventListingOptions } from "@/lib/events/eventOptions";

export default function EventGuestPreview({
  beaconId,
  people,
  count,
  listing,
  creatorId,
}: {
  beaconId: string;
  people: EventGoingPerson[];
  count: number;
  listing: EventListingOptions;
  creatorId: string | null;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const hostsOnly = listing.guest_list_visibility === "hosts_only";
  const isHost = Boolean(user?.id && creatorId && user.id === creatorId);
  const showAvatars = !hostsOnly || isHost;
  const canOpen = count > 0 && showAvatars;

  return (
    <div>
      <EventGoingAvatars
        people={showAvatars ? people : []}
        count={count}
        onOpen={canOpen ? () => setOpen((value) => !value) : undefined}
      />
      {open && canOpen ? (
        user ? (
          <EventRsvpDirectory beaconId={beaconId} allowPeek />
        ) : (
          <ul className="mt-3 space-y-2" data-testid="event-guest-preview-list">
            {people.map((person, index) => (
              <li key={person.user_id || `${person.name}-${index}`} className="flex items-center gap-2">
                <ConnectionPeerAvatar label={person.name} imageUrl={person.avatar_url} size="sm" />
                <span className="text-sm text-on-surface">{person.name}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
