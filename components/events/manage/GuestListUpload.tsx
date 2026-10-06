"use client";

import { RefreshCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ds/Button";
import { cardClassName } from "@/components/ds/Card";
import { StatusPill } from "@/components/ds/StatusPill";
import { TextArea } from "@/components/ds/TextField";
import { toast } from "@/components/ds/Toast";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import type { GuestListStatus } from "@/lib/events/guestListService";

type Status = Pick<GuestListStatus, "uploaded" | "matched" | "teasers"> & { entries?: GuestListStatus["entries"] };

const SHOWN_ENTRIES = 40;

/**
 * Seed the room (spec §7.6.4 Guests): upload emails by CSV or paste. Click matches people who
 * already have an account and sends anonymized teasers, never names.
 */
export function GuestListUpload({ beaconId, initial }: { beaconId: string; initial: Status | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status | null>(initial);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "paste" | "match" | null>(null);

  const send = async (path: string, body: object | null, kind: NonNullable<typeof busy>) => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { ...(await getFreshAuthHeaders()), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json()) as Status & { error?: string };
      if (!res.ok) {
        setError(json.error || (kind === "match" ? "Couldn’t rematch the list." : "Couldn’t upload the list."));
        return false;
      }
      setStatus(json);
      return true;
    } catch {
      setError("Something went wrong. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const upload = async (csv_text: string, source: "csv" | "manual") => {
    const ok = await send(`/api/beacons/${beaconId}/guest-list`, { source, csv_text }, source === "csv" ? "upload" : "paste");
    if (ok) {
      setPaste("");
      toast.success("Guest list updated");
    }
  };

  const entries = status?.entries ?? [];

  return (
    <section id="guest-list" aria-labelledby="guest-list-heading" className={cardClassName()} data-testid="guest-list-upload">
      <h2 id="guest-list-heading" className="type-headline text-fg">
        Seed the room
      </h2>
      <p className="type-meta mt-0.5 max-w-[60ch] text-fg-secondary">
        Upload emails as a CSV or paste them below. People already on Click get an anonymous teaser, never your list or
        their names.
      </p>

      {status && status.uploaded > 0 ? (
        <p className="type-body tabular mt-4 text-fg" data-testid="guest-list-status">
          {status.uploaded} uploaded · {status.matched} on Click · {status.teasers} teasers sent
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={Upload} size="sm" loading={busy === "upload"} disabled={busy != null} onClick={() => fileRef.current?.click()}>
          Upload CSV
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void file.text().then((text) => upload(text, "csv"));
          }}
        />
        {status && status.uploaded > 0 ? (
          <Button
            icon={RefreshCw}
            size="sm"
            variant="plain"
            loading={busy === "match"}
            disabled={busy != null}
            onClick={() => void send(`/api/beacons/${beaconId}/guest-list/match`, null, "match")}
          >
            Rematch
          </Button>
        ) : null}
      </div>

      <TextArea
        label="Paste emails"
        className="mt-4"
        rows={3}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder={"one@email.com\ntwo@email.com"}
        error={error}
      />
      <Button
        size="sm"
        variant="primary"
        className="mt-3"
        loading={busy === "paste"}
        disabled={busy != null || !paste.trim()}
        onClick={() => void upload(paste, "manual")}
      >
        Add emails
      </Button>

      {entries.length > 0 ? (
        <ul className="mt-5" aria-label="Uploaded guests">
          {entries.slice(0, SHOWN_ENTRIES).map((row) => (
            <li key={row.id} className="flex min-h-11 items-center justify-between gap-3 shadow-[inset_0_1px_0_var(--hairline)]">
              <span className="type-body min-w-0 truncate text-fg">
                {row.email_truncated ?? (row.instagram_handle ? `@${row.instagram_handle}` : "Unknown")}
              </span>
              <StatusPill variant={row.matched ? "success" : "neutral"}>{row.matched ? "On Click" : "Not on Click"}</StatusPill>
            </li>
          ))}
          {entries.length > SHOWN_ENTRIES ? (
            <li className="type-meta pt-2 text-fg-tertiary">and {entries.length - SHOWN_ENTRIES} more</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
