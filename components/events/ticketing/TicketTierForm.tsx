"use client";
import { useState } from "react";
import { FcButton, FcField, FcInput, FcTextarea } from "@/components/fc";
import type { TicketTier } from "@/lib/ticketing/types";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
export default function TicketTierForm({
  beaconId,
  tier,
  onSaved,
}: {
  beaconId: string;
  tier?: TicketTier;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        try {
          const value = (key: string) => String(form.get(key) ?? "");
          await ticketingApi(
            "/api/beacons/" + beaconId + "/tickets/tiers" + (tier ? "/" + tier.id : ""),
            {
              name: value("name"),
              description: value("description") || null,
              unit_amount: Math.round(Number(value("price")) * 100),
              capacity: Number(value("capacity")),
              max_per_order: Number(value("max_per_order")),
              max_per_user: value("max_per_user") ? Number(value("max_per_user")) : null,
              sales_start_at: value("start") ? new Date(value("start")).toISOString() : null,
              sales_end_at: value("end") ? new Date(value("end")).toISOString() : null,
              sort_order: Number(value("sort_order")),
            },
            tier ? "PATCH" : "POST",
          );
          onSaved();
        } catch (e) {
          setError(ticketingError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FcField label="Tier name">
        <FcInput name="name" required maxLength={120} defaultValue={tier?.name} />
      </FcField>
      <FcField label="Description">
        <FcTextarea name="description" maxLength={2000} defaultValue={tier?.description ?? ""} />
      </FcField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FcField label="Price (USD)">
          <FcInput
            name="price"
            type="number"
            min="0.50"
            step="0.01"
            required
            defaultValue={tier ? String(tier.unit_amount / 100) : ""}
          />
        </FcField>
        <FcField label="Capacity">
          <FcInput
            name="capacity"
            type="number"
            min={0}
            max={100000}
            required
            defaultValue={tier?.capacity ?? 100}
          />
        </FcField>
        <FcField label="Maximum per order">
          <FcInput
            name="max_per_order"
            type="number"
            min={1}
            max={20}
            required
            defaultValue={tier?.max_per_order ?? 8}
          />
        </FcField>
        <FcField label="Maximum per user (optional)">
          <FcInput
            name="max_per_user"
            type="number"
            min={1}
            max={100}
            defaultValue={tier?.max_per_user ?? ""}
          />
        </FcField>
        <FcField label="Sales start (local time)">
          <FcInput name="start" type="datetime-local" defaultValue={local(tier?.sales_start_at)} />
        </FcField>
        <FcField label="Sales end (local time)">
          <FcInput name="end" type="datetime-local" defaultValue={local(tier?.sales_end_at)} />
        </FcField>
        <FcField label="Display order">
          <FcInput
            name="sort_order"
            type="number"
            min={0}
            max={1000}
            defaultValue={tier?.sort_order ?? 0}
          />
        </FcField>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <FcButton type="submit" disabled={busy}>
        {busy ? "Saving…" : tier ? "Save tier" : "Add tier"}
      </FcButton>
      <p className="text-sm">
        Price changes apply to future orders. Existing orders retain their original price.
      </p>
    </form>
  );
}
function local(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
