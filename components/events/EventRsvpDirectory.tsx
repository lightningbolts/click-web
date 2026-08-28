"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import UserProfileModal from "@/components/UserProfileModal";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";

type Attendee = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

type DirectoryPayload = {
  attendees: Attendee[];
  current_user_signed_up: boolean;
};

const fetcher = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load RSVPs");
  return res.json() as Promise<DirectoryPayload>;
};

export default function EventRsvpDirectory({
  beaconId,
  allowPeek = false,
}: {
  beaconId: string;
  allowPeek?: boolean;
}) {
  const { user } = useAuth();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const { data } = useSWR(user ? eventRsvpKey(beaconId) : null, fetcher);

  if (!data?.attendees?.length) return null;
  if (!allowPeek && !data.current_user_signed_up) return null;
  const attendees = data.attendees;

  return (
    <div className="mt-5 border-t border-border-hard pt-4" data-testid="event-rsvp-directory">
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
              <span className="text-sm font-medium text-on-surface">{person.name}</span>
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
