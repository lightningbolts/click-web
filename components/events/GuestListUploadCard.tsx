"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { FcButton, FcCard, FcTextarea } from "@/components/fc";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";

type GuestEntry = {
  id: string;
  email_truncated: string | null;
  instagram_handle: string | null;
  matched: boolean;
  match_confidence: string;
};

type GuestListStatus = {
  guest_list_id?: string;
  uploaded: number;
  matched: number;
  teasers: number;
  matched_at?: string | null;
  entries?: GuestEntry[];
};

const fetcher = async (url: string) => {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.json() as Promise<GuestListStatus>;
};

export default function GuestListUploadCard({ beaconId }: { beaconId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: status, mutate } = useSWR(`/api/beacons/${beaconId}/guest-list`, fetcher);

  const upload = async (csvText: string, source: "csv" | "manual") => {
    setBusy(true);
    setError(null);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(`/api/beacons/${beaconId}/guest-list`, {
        method: "POST",
        headers,
        body: JSON.stringify({ source, csv_text: csvText }),
      });
      const json = (await res.json()) as GuestListStatus & { error?: string };
      if (!res.ok) {
        setError(json.error || "Upload failed");
        return;
      }
      await mutate(json, { revalidate: false });
      setPaste("");
    } catch {
      setError("Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    setBusy(true);
    setError(null);
    try {
      const headers = await getFreshAuthHeaders();
      const res = await fetch(`/api/beacons/${beaconId}/guest-list/match`, {
        method: "POST",
        headers,
      });
      const json = (await res.json()) as GuestListStatus & { error?: string };
      if (!res.ok) {
        setError(json.error || "Match failed");
        return;
      }
      await mutate(json, { revalidate: false });
    } catch {
      setError("Match failed");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    await upload(text, "csv");
  };

  return (
    <FcCard className="space-y-4 p-4" data-testid="guest-list-upload">
      <div>
        <h2 className="text-lg font-bold text-on-surface">Seed this room</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Upload emails (CSV or paste). Click matches people who already have an account and
          sends anonymized teasers — never names unless they already Clicked.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <FcButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Working…" : "Upload CSV"}
        </FcButton>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
        {status && (status.uploaded ?? 0) > 0 ? (
          <FcButton type="button" variant="secondary" disabled={busy} onClick={() => void rematch()}>
            Rematch
          </FcButton>
        ) : null}
        <FcButton type="button" variant="secondary" disabled={busy} onClick={() => void mutate()}>
          Refresh
        </FcButton>
      </div>
      <FcTextarea
        name="guest_paste"
        rows={4}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        placeholder="one@email.com&#10;two@email.com"
      />
      <FcButton
        type="button"
        disabled={busy || !paste.trim()}
        onClick={() => void upload(paste, "manual")}
      >
        Add emails
      </FcButton>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {status ? (
        <p className="text-sm text-on-surface" data-testid="guest-list-status">
          {status.uploaded} uploaded · {status.matched} matched · {status.teasers} teasers
        </p>
      ) : null}
      {status?.entries && status.entries.length > 0 ? (
        <ul className="divide-y divide-border-hard text-sm">
          {status.entries.slice(0, 40).map((row) => (
            <li key={row.id} className="flex justify-between py-2">
              <span className="text-on-surface">
                {row.email_truncated ?? (row.instagram_handle ? `@${row.instagram_handle}` : "—")}
              </span>
              <span className="text-on-surface-variant">{row.matched ? "On Click" : "Not on Click"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </FcCard>
  );
}
