"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import UserProfileModal from "@/components/UserProfileModal";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import { fetchEventRsvpPayload } from "@/lib/events/eventRsvpClient";
import { cn } from "@/lib/cn";

type Attendee = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

type MutualPayload = {
  count: number;
  attendees: Attendee[];
};

const fetchMutual = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load mutual attendees");
  return res.json() as Promise<MutualPayload>;
};

export default function EventRsvpDirectory({
  beaconId,
  allowPeek = false,
  className,
}: {
  beaconId: string;
  allowPeek?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const { data } = useSWR(user ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload);
  const { data: mutual } = useSWR(
    user ? `/api/beacons/${beaconId}/mutual-attendees` : null,
    fetchMutual,
  );

  if (!data?.attendees?.length) return null;
  if (!allowPeek && !data.current_user_signed_up) return null;
  const attendees = data.attendees;
  const mutualIds = new Set((mutual?.attendees ?? []).map((person) => person.user_id));

  return (
    <div
      className={cn("mt-5 border-t border-border-hard pt-4", className)}
      data-testid="event-rsvp-directory"
    >
      <p className="text-sm font-semibold text-on-surface">Who&apos;s going</p>
      <ul className="mt-3 space-y-2">
        {attendees.map((person) => (
          <li key={person.user_id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[12px] px-2 py-1.5 text-left hover:bg-surface-container"
              onClick={() => setProfileUserId(person.user_id)}
            >
              <ConnectionPeerAvatar label={person.name} imageUrl={person.avatar_url} size="sm" />
              <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">{person.name}</span>
              {mutualIds.has(person.user_id) ? (
                <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                  You know them
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {profileUserId ? (
        <UserProfileModal
          userId={profileUserId}
          getAuthHeaders={getFreshAuthHeaders}
          onClose={() => setProfileUserId(null)}
          currentUserId={user?.id}
        />
      ) : null}
    </div>
  );
}
