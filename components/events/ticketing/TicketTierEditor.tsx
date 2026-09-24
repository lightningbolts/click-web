"use client";
import { useState } from "react";
import type { TicketTier } from "@/lib/ticketing/types";
import { FcButton, FcCard } from "@/components/fc";
import { money } from "@/lib/ticketing/format";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import TicketTierForm from "./TicketTierForm";
export default function TicketTierEditor({
  beaconId,
  tiers,
  refresh,
}: {
  beaconId: string;
  tiers: TicketTier[];
  refresh: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4">
      <h3 className="font-bold">Ticket tiers</h3>
      {tiers.map((t) => (
        <FcCard key={t.id} className="space-y-3 p-4">
          <h4>
            {t.name} · {money(t.unit_amount, t.currency)} · {t.is_active ? "Active" : "Inactive"}
          </h4>
          <p>
            {t.sold} sold · {t.held} held · {t.remaining} remaining
          </p>
          {editing === t.id ? (
            <TicketTierForm
              beaconId={beaconId}
              tier={t}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
            />
          ) : (
            <FcButton onClick={() => setEditing(t.id)}>Edit {t.name}</FcButton>
          )}
          <FcButton
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ticketingApi(
                  "/api/beacons/" + beaconId + "/tickets/tiers/" + t.id,
                  { is_active: !t.is_active },
                  "PATCH",
                );
                refresh();
              } catch (e) {
                setError(ticketingError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.is_active ? "Deactivate" : "Activate"} {t.name}
          </FcButton>
        </FcCard>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      <details>
        <summary className="cursor-pointer font-bold">Add ticket tier</summary>
        <TicketTierForm beaconId={beaconId} onSaved={refresh} />
      </details>
    </section>
  );
}
