"use client";

import { useState } from "react";
import useSWR from "swr";
import { PersonRow } from "@/components/ds/PersonRow";
import { SegmentedControl } from "@/components/ds/SegmentedControl";
import { StatusPill } from "@/components/ds/StatusPill";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import { fetchEventRsvpPayload } from "@/lib/events/eventRsvpClient";
import { personHref } from "@/lib/shell/appNav";
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

type Sort = "best" | "az" | "clicks";

const fetchMutual = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load mutual attendees");
  return res.json() as Promise<MutualPayload>;
};

const byName = (a: Attendee, b: Attendee) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Who's going (spec §7.6.2 "See all"): your Clicks first, A–Z, or only your Clicks. */
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
  const [sort, setSort] = useState<Sort>("best");
  const { data } = useSWR(user ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload);
  const { data: mutual } = useSWR(
    user ? `/api/beacons/${beaconId}/mutual-attendees` : null,
    fetchMutual,
  );

  if (!data?.attendees?.length) return null;
  if (!allowPeek && !data.current_user_signed_up) return null;
  const mutualIds = new Set((mutual?.attendees ?? []).map((person) => person.user_id));
  const known = (p: Attendee) => mutualIds.has(p.user_id);
  const attendees = [...data.attendees].sort(byName);
  const shown =
    sort === "clicks"
      ? attendees.filter(known)
      : sort === "best"
        ? [...attendees.filter(known), ...attendees.filter((p) => !known(p))]
        : attendees;

  return (
    <div className={cn("space-y-3", className)} data-testid="event-rsvp-directory">
      {mutualIds.size > 0 ? (
        <SegmentedControl<Sort>
          size="sm"
          fullWidth
          label="Sort guests"
          value={sort}
          onChange={setSort}
          segments={[
            { value: "best", label: "Best match" },
            { value: "az", label: "A–Z" },
            { value: "clicks", label: `Your Clicks · ${mutualIds.size}` },
          ]}
        />
      ) : null}
      <ul>
        {shown.map((person) => (
          <li key={person.user_id}>
            <PersonRow
              seed={person.user_id}
              name={person.name}
              src={person.avatar_url}
              href={personHref(person.user_id)}
              trailing={
                known(person) ? (
                  <StatusPill variant="tinted">Your Click</StatusPill>
                ) : person.user_id === user?.id ? (
                  <StatusPill variant="neutral">You</StatusPill>
                ) : null
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
