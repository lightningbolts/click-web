"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ds/Avatar";
import { Button } from "@/components/ds/Button";
import { Checkbox } from "@/components/ds/Checkbox";
import { StatusPill } from "@/components/ds/StatusPill";
import { toast } from "@/components/ds/Toast";
import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import type { ManageRequest } from "@/lib/events/eventManageData";

type Action = "approve" | "deny";

/**
 * Pending and waitlisted requests with names and avatars, approved or declined one at a
 * time or in bulk (spec §7.6.4). Read-only for Place viewers; the API enforces it too.
 */
export function ManageRequests({
  beaconId,
  requests,
  readOnly,
  times,
}: {
  beaconId: string;
  requests: ManageRequest[];
  readOnly: boolean;
  /** Server-formatted request times, keyed by user id. */
  times: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  // Rows already acted on hide at once; the refresh brings the server's truth.
  const [done, setDone] = useState<Set<string>>(new Set());
  const rows = requests.filter((r) => !done.has(r.user_id));
  const live = new Set(rows.map((r) => r.user_id));
  const picked = [...selected].filter((id) => live.has(id));

  const act = async (ids: string[], action: Action) => {
    if (ids.length === 0) return;
    setBusy(ids.length === 1 ? `${ids[0]}:${action}` : `bulk:${action}`);
    const headers = { ...(await getFreshAuthHeaders()), "Content-Type": "application/json" };
    const results = await Promise.all(
      ids.map(async (user_id) => {
        try {
          const res = await fetch(`/api/beacons/${beaconId}/rsvp/requests`, {
            method: "POST",
            headers,
            body: JSON.stringify({ user_id, action }),
          });
          return res.ok ? user_id : null;
        } catch {
          return null;
        }
      }),
    );
    const ok = results.filter((id): id is string => id != null);
    const failed = ids.length - ok.length;
    setDone((cur) => new Set([...cur, ...ok]));
    setSelected(new Set());
    setBusy(null);
    if (ok.length > 0) {
      const verb = action === "approve" ? "Approved" : "Declined";
      toast.success(ok.length === 1 ? `${verb} 1 request` : `${verb} ${ok.length} requests`);
      router.refresh();
    }
    if (failed > 0) toast.error(failed === 1 ? "1 request couldn’t be updated." : `${failed} requests couldn’t be updated.`);
  };

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPicked = rows.length > 0 && picked.length === rows.length;

  return (
    <section aria-labelledby="manage-requests-heading" data-testid="manage-requests">
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="manage-requests-heading" className="type-headline text-fg">
          Requests <span className="tabular text-fg-tertiary">{rows.length}</span>
        </h2>
        {!readOnly && rows.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={picked.length === 0 || busy != null}
              loading={busy === "bulk:deny"}
              onClick={() => void act(picked, "deny")}
              aria-label={picked.length ? `Decline ${picked.length} selected` : "Decline selected"}
            >
              Decline{picked.length ? ` ${picked.length}` : ""}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={picked.length === 0 || busy != null}
              loading={busy === "bulk:approve"}
              onClick={() => void act(picked, "approve")}
              aria-label={picked.length ? `Approve ${picked.length} selected` : "Approve selected"}
            >
              Approve{picked.length ? ` ${picked.length}` : ""}
            </Button>
          </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="type-body rounded-lg bg-surface px-4 py-5 text-fg-secondary dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
          No one is waiting. Requests show up here when approval is on or the event is full.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
          {!readOnly ? (
            <li className="flex min-h-11 items-center gap-3 px-4">
              <Checkbox
                aria-label="Select all requests"
                checked={allPicked}
                onChange={() => setSelected(allPicked ? new Set() : new Set(rows.map((r) => r.user_id)))}
              />
              <span className="type-meta text-fg-tertiary">{picked.length ? `${picked.length} selected` : "Select all"}</span>
            </li>
          ) : null}
          {rows.map((r) => (
            <li key={r.user_id} className="flex min-h-16 items-center gap-3 px-4 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
              {!readOnly ? (
                <Checkbox aria-label={`Select ${r.name}`} checked={selected.has(r.user_id)} onChange={() => toggle(r.user_id)} />
              ) : null}
              <Avatar seed={r.user_id} name={r.name} src={r.avatar_url} size={32} />
              <span className="min-w-0 flex-1">
                <span className="type-body-strong block truncate text-fg">{r.name}</span>
                <span className="type-meta block truncate text-fg-tertiary">{times[r.user_id]}</span>
              </span>
              <StatusPill variant={r.status === "waitlisted" ? "warning" : "tinted"}>
                {r.status === "waitlisted" ? "Waitlist" : "Requested"}
              </StatusPill>
              {!readOnly ? (
                <span className="hidden shrink-0 gap-1 sm:flex">
                  <Button
                    size="sm"
                    variant="plain"
                    className="text-fg-secondary"
                    disabled={busy != null}
                    loading={busy === `${r.user_id}:deny`}
                    onClick={() => void act([r.user_id], "deny")}
                    aria-label={`Decline ${r.name}`}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    variant="tinted"
                    disabled={busy != null}
                    loading={busy === `${r.user_id}:approve`}
                    onClick={() => void act([r.user_id], "approve")}
                    aria-label={`Approve ${r.name}`}
                  >
                    Approve
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
