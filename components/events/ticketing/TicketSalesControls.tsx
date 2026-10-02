"use client";
import { useState } from "react";
import { FcButton, FcField, FcInput } from "@/components/fc";
import type { TicketingEvent } from "@/lib/ticketing/types";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
export default function TicketSalesControls({
  beaconId,
  event,
  refresh,
}: {
  beaconId: string;
  event: TicketingEvent;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [start, setStart] = useState(local(event.ticket_sales_start_at)),
    [end, setEnd] = useState(local(event.ticket_sales_end_at));
  const targets =
    event.ticketing_status === "sales_closed"
      ? []
      : event.ticketing_status === "sales_open"
        ? ["sales_paused", "sales_closed"]
        : event.ticketing_status === "sales_paused"
          ? ["sales_open", "sales_closed"]
          : ["draft", "sales_open"];
  return (
    <section className="space-y-3">
      <h3 className="font-bold">Sales: {event.ticketing_status.replaceAll("_", " ")}</h3>
      <FcField label="Sales start (local time, optional)">
        <FcInput type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
      </FcField>
      <FcField label="Sales end (local time, optional)">
        <FcInput type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
      </FcField>
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <FcButton
            key={target}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await ticketingApi("/api/beacons/" + beaconId + "/tickets/status", {
                  ticketing_status: target,
                  ticket_sales_start_at: start ? new Date(start).toISOString() : null,
                  ticket_sales_end_at: end ? new Date(end).toISOString() : null,
                });
                refresh();
              } catch (e) {
                setError(ticketingError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {
              (
                {
                  draft: "Use ticketed admission",
                  sales_open: "Open sales",
                  sales_paused: "Pause sales",
                  sales_closed: "Close sales permanently",
                } as Record<string, string>
              )[target]
            }
          </FcButton>
        ))}
      </div>
      <p>
        Closing sales is permanent. Ticketed admission continues when sales are paused or closed.
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function local(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
