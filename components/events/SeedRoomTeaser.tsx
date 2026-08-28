"use client";

import useSWR from "swr";
import { useAuth } from "@/lib/AuthContext";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

type TeaserPayload = {
  teaser: {
    headline: string;
    count: number;
    label: string;
  } | null;
};

const fetcher = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load");
  return res.json() as Promise<TeaserPayload>;
};

export default function SeedRoomTeaser({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  const { data } = useSWR(user ? `/api/me/event-bookmarks/${beaconId}/teaser` : null, fetcher);
  const teaser = data?.teaser;
  if (!user || !teaser) return null;

  return (
    <div className="rounded-[12px] border border-border-hard bg-surface p-4" data-testid="seed-room-teaser">
      <p className="text-sm font-semibold text-on-surface">{teaser.headline}</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Names stay private until you Click. Open the app at the event to meet them.
      </p>
    </div>
  );
}
