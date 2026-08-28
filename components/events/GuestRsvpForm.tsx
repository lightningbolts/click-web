"use client";

import { useState } from "react";
import { FcButton, FcField, FcInput } from "@/components/fc";

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
        setMessage(json.error || "Could not save RSVP");
        return;
      }
      setStatus("ok");
      setMessage("You're on the list.");
    } catch {
      setStatus("error");
      setMessage("Could not save RSVP");
    }
  };

  if (status === "ok") {
    return (
      <div className="rounded-[12px] border border-border-hard bg-primary-container p-4">
        <p className="text-sm font-semibold text-on-secondary-container">{message}</p>
        <p className="mt-1 text-sm text-on-surface-variant">We’ll keep your spot. Share the event with a friend.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4" data-testid="guest-rsvp-form">
      <FcField label="Name">
        <FcInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Your name" />
      </FcField>
      <FcField label="Email or phone">
        <FcInput
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          placeholder="you@email.com"
        />
      </FcField>
      {message ? <p className="text-sm text-error">{message}</p> : null}
      <FcButton type="submit" className="w-full" disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "RSVP"}
      </FcButton>
    </form>
  );
}
