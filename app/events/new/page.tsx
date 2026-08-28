"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import LoginModal from "@/components/LoginModal";
import EventCreateForm from "@/components/events/EventCreateForm";
import EventPageShell from "@/components/events/EventPageShell";
import { FcButton, FcCard, FcSectionHeader } from "@/components/fc";

export default function NewEventPage() {
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <EventPageShell className="py-10">
      <FcSectionHeader
        title="Create event"
        subtitle="Set the details, location, and schedule for your event."
      />
      {user ? (
        <EventCreateForm />
      ) : (
        <FcCard className="space-y-4 p-6 md:p-8">
          <p className="text-on-surface-variant">Sign in to publish an event on Click.</p>
          <FcButton type="button" onClick={() => setLoginOpen(true)}>
            Log in
          </FcButton>
          <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} nextPath="/events/new" />
        </FcCard>
      )}
    </EventPageShell>
  );
}
