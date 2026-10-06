"use client";

import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ds/Button";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { TextField } from "@/components/ds/TextField";

/** Signed-out RSVP (spec §7.6.2): name and email or phone, no account needed. */
export default function GuestRsvpForm({ beaconId }: { beaconId: string }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch(`/api/beacons/${beaconId}/rsvp/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error || "Could not save your RSVP.");
        return;
      }
      setStatus("ok");
    } catch {
      setStatus("error");
      setMessage("Could not save your RSVP.");
    }
  };

  if (status === "ok") {
    return (
      <InlineNotice variant="info" icon={CircleCheck} live>
        You’re on the list. Share the event with a friend.
      </InlineNotice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3" data-testid="guest-rsvp-form">
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={80}
        autoComplete="name"
        placeholder="Your name"
      />
      <TextField
        label="Email or phone"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        required
        autoComplete="email"
        placeholder="you@email.com"
        error={status === "error" ? message : undefined}
      />
      <Button variant="primary" type="submit" size="lg" fullWidth loading={status === "saving"}>
        RSVP
      </Button>
    </form>
  );
}
