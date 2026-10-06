"use client";

import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import { Pencil } from "lucide-react";
import EventPageShell from "@/components/events/EventPageShell";
import { eventEditPath } from "@/lib/events/eventUrls";
import { loginHref } from "@/lib/shell/appNav";

export default function EventEditSignIn({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  if (user) return null;

  return (
    <EventPageShell className="py-10">
      <EmptyState
        icon={Pencil}
        title="Log in to edit this event"
        action={<Button href={loginHref(eventEditPath(beaconId))}>Log in</Button>}
      />
    </EventPageShell>
  );
}
