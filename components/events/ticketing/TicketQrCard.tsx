"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FcButton, FcCard } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
import type { Ticket } from "@/lib/ticketing/types";
export default function TicketQrCard({ beaconId, ticket }: { beaconId: string; ticket: Ticket }) {
  const [credential, setCredential] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function show() {
    setBusy(true);
    setError("");
    try {
      const data = await ticketingApi<{ credential_url: string }>(
        "/api/beacons/" + beaconId + "/tickets/" + ticket.id + "/credential",
        {},
      );
      setCredential(data.credential_url);
    } catch (e) {
      setCredential("");
      setError(ticketingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FcCard className="space-y-3 p-5">
      <h2 className="font-bold">
        {ticket.event_name ?? "Event"} · {ticket.tier_name}
      </h2>
      <p>
        Ticket {ticket.ticket_number} · {ticket.status.replaceAll("_", " ")}
      </p>
      {ticket.status === "valid" ? (
        <>
          <FcButton disabled={busy} onClick={show}>
            {busy ? "Generating…" : credential ? "Regenerate QR" : "Show QR"}
          </FcButton>
          {credential ? (
            <>
              <QRCodeSVG
                value={credential}
                size={224}
                title={"Admission QR for " + ticket.ticket_number}
              />
              <p>Regenerating invalidates the previous QR.</p>
              <details>
                <summary>Manual check-in credential</summary>
                <p className="break-all">{credential}</p>
              </details>
            </>
          ) : null}
        </>
      ) : (
        <p>This ticket cannot generate an admission QR.</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </FcCard>
  );
}
