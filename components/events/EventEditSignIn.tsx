"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import LoginModal from "@/components/LoginModal";
import { FcButton, FcCard } from "@/components/fc";
import EventPageShell from "@/components/events/EventPageShell";
import { eventEditPath } from "@/lib/events/eventUrls";

export default function EventEditSignIn({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(true);
  if (user) return null;

  return (
    <EventPageShell className="py-10">
      <FcCard className="space-y-4 p-6 md:p-8">
        <p className="text-on-surface-variant">Sign in to edit this event.</p>
        <FcButton type="button" onClick={() => setLoginOpen(true)}>
          Log in
        </FcButton>
        <LoginModal
          isOpen={loginOpen}
          onClose={() => setLoginOpen(false)}
          nextPath={eventEditPath(beaconId)}
        />
      </FcCard>
    </EventPageShell>
  );
}
