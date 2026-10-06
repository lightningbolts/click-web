"use client";

import { useAuth } from "@/lib/AuthContext";
import { loginHref } from "@/lib/shell/appNav";
import EventCreateForm from "@/components/events/EventCreateForm";
import EventPageShell from "@/components/events/EventPageShell";
import { FcCard, FcSectionHeader } from "@/components/fc";
import { Button } from "@/components/ds/Button";

export default function NewEventPage() {
  const { user } = useAuth();

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
          <Button href={loginHref("/events/new")}>Log in</Button>
        </FcCard>
      )}
    </EventPageShell>
  );
}
