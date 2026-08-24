"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import LoginModal from "@/components/LoginModal";
import EventCreateForm from "@/components/events/EventCreateForm";
import { FcButton, FcCard, FcPageShell, FcSectionHeader } from "@/components/fc";

export default function NewEventPage() {
  const { user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <FcPageShell className="px-4 py-10 md:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <FcSectionHeader
          title="Create event"
          subtitle="Publish a public page anyone can RSVP to. We’ll copy the share link when it goes live."
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
      </div>
    </FcPageShell>
  );
}
