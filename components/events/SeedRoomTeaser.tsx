"use client";

import { Sparkles } from "lucide-react";
import useSWR from "swr";
import { InlineNotice } from "@/components/ds/InlineNotice";
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
    <div data-testid="seed-room-teaser">
      <InlineNotice variant="info" icon={Sparkles}>
        <span className="font-semibold">{teaser.headline}</span>{" "}
        Names stay private until you Click. Open the app at the event to meet them.
      </InlineNotice>
    </div>
  );
}
