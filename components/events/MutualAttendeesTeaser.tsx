"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import UserProfileModal from "@/components/UserProfileModal";
import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";

type MutualPayload = {
  count: number;
  attendees: Array<{ user_id: string; name: string; avatar_url: string | null }>;
};

const fetcher = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load");
  return res.json() as Promise<MutualPayload>;
};

export default function MutualAttendeesTeaser({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const { data: payload } = useSWR(
    user ? `/api/beacons/${beaconId}/mutual-attendees` : null,
    fetcher,
  );

  if (!user || !payload || payload.count < 1) return null;

  return (
    <div className="rounded-[12px] border border-border-hard bg-surface p-4" data-testid="mutual-attendees-teaser">
      <p className="text-sm font-semibold text-on-surface">
        {payload.count} {payload.count === 1 ? "person" : "people"} you know {payload.count === 1 ? "is" : "are"} going
      </p>
      <ul className="mt-3 space-y-2">
        {payload.attendees.slice(0, 8).map((person) => (
          <li key={person.user_id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[12px] px-1 py-1 text-left hover:bg-surface-container"
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
          currentUserId={user.id}
        />
      ) : null}
    </div>
  );
}
