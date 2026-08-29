"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { eventEditPath, eventManagePath } from "@/lib/events/eventUrls";

export default function EventHostActions({
  beaconId,
  creatorId,
}: {
  beaconId: string;
  creatorId: string | null;
}) {
  const { user } = useAuth();
  if (!user?.id || !creatorId || user.id !== creatorId) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="event-host-actions">
      <Link href={eventEditPath(beaconId)} className="fc-btn-primary inline-flex h-11 items-center px-4">
        Edit details
      </Link>
      <Link
        href={eventManagePath(beaconId)}
        className="inline-flex h-11 items-center rounded-[8px] border border-border-hard bg-surface px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
      >
        Host settings
      </Link>
    </div>
  );
}
