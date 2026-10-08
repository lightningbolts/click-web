"use client";

import { MoreHorizontal, RotateCcw, UserCheck } from "lucide-react";
import { useState } from "react";
import { useConfirm } from "@/components/ds/ConfirmDialog";
import { IconButton } from "@/components/ds/IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ds/Menu";
import { PersonRow } from "@/components/ds/PersonRow";
import { StatusPill } from "@/components/ds/StatusPill";
import { toast } from "@/components/ds/Toast";
import { formatMoney } from "@/lib/ticketing/money";
import {
  TicketingError,
  checkInTicket,
  refundOrder,
  ticketingErrorMessage,
} from "@/lib/ticketing/ticketingClient";
import type { TicketAttendee } from "@/lib/ticketing/types";

const PILL: Record<TicketAttendee["status"], { label: string; variant: "success" | "neutral" | "destructive" } | null> = {
  valid: null,
  checked_in: { label: "Checked in", variant: "success" },
  refunded: { label: "Refunded", variant: "neutral" },
  void: { label: "Void", variant: "neutral" },
};

/** Why a manual check-in didn't admit, in the host's words. */
const SCAN_REFUSAL: Record<string, string> = {
  refunded: "That ticket was refunded.",
  event_cancelled: "This event was cancelled.",
  wrong_event: "That ticket is for another event.",
};

const failure = (e: unknown) => ticketingErrorMessage(e instanceof TicketingError ? e : new TicketingError(0, "network"));

/**
 * Ticket holders with per-row actions (spec §5.2): check in by hand, refund one ticket.
 * Rows update in place after an action; `readOnly` drops the menu.
 */
export function TicketAttendeeList({
  beaconId,
  attendees,
  readOnly,
  timeZone,
}: {
  beaconId: string;
  attendees: TicketAttendee[];
  readOnly: boolean;
  timeZone: string;
}) {
  const [changed, setChanged] = useState<Record<string, Partial<TicketAttendee>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const patch = (id: string, next: Partial<TicketAttendee>) => setChanged((all) => ({ ...all, [id]: { ...all[id], ...next } }));

  const checkIn = async (a: TicketAttendee) => {
    setBusy(a.ticket_id);
    try {
      const scan = await checkInTicket(beaconId, a.ticket_id);
      if (scan.result === "checked_in" || scan.result === "already_checked_in") {
        patch(a.ticket_id, { status: "checked_in", checked_in_at: scan.checked_in_at ?? new Date().toISOString() });
        if (scan.result === "checked_in") toast.success(`${a.name} checked in`);
      } else {
        toast.error(SCAN_REFUSAL[scan.result] ?? "That ticket can’t be checked in.");
      }
    } catch (e) {
      toast.error(failure(e));
    } finally {
      setBusy(null);
    }
  };

  const refund = async (a: TicketAttendee) => {
    const ok = await confirm({
      title: a.amount > 0 ? `Refund ${formatMoney(a.amount, a.currency)} to ${a.name}?` : `Refund ${a.name}’s ticket?`,
      message: "Their ticket stops working right away.",
      confirmLabel: "Refund",
      destructive: true,
    });
    if (!ok) return;
    setBusy(a.ticket_id);
    try {
      await refundOrder(a.order_id, [a.ticket_id]);
      patch(a.ticket_id, { status: "refunded", refundable: false });
      toast.success("Refund started");
    } catch (e) {
      toast.error(failure(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {attendees.map((row) => {
          const a = { ...row, ...changed[row.ticket_id] };
          const pill = PILL[a.status];
          const canCheckIn = a.status === "valid";
          const actions = !readOnly && (canCheckIn || a.refundable);
          return (
            <li key={a.ticket_id} className="px-4 [&+&]:shadow-[inset_0_1px_0_var(--hairline)]">
              <PersonRow
                seed={a.user_id}
                name={a.name}
                src={a.avatar_url}
                subtitle={
                  <span className="tabular">
                    {a.tier_name} · {a.status === "checked_in" && a.checked_in_at ? `In at ${time.format(Date.parse(a.checked_in_at))}` : a.ticket_number}
                  </span>
                }
                trailing={
                  <span className="flex shrink-0 items-center gap-2">
                    {pill ? <StatusPill variant={pill.variant}>{pill.label}</StatusPill> : null}
                    {actions ? (
                      // Non-modal: a modal menu that opens a dialog leaves the body unclickable (Radix).
                      <Menu modal={false}>
                        <MenuTrigger asChild>
                          <IconButton icon={MoreHorizontal} size="sm" aria-label={`Actions for ${a.name}`} disabled={busy === a.ticket_id} />
                        </MenuTrigger>
                        <MenuContent className="min-w-48">
                          {canCheckIn ? (
                            <MenuItem icon={UserCheck} onSelect={() => void checkIn(a)}>
                              Check in
                            </MenuItem>
                          ) : null}
                          {a.refundable ? (
                            <MenuItem icon={RotateCcw} destructive onSelect={() => void refund(a)}>
                              Refund ticket
                            </MenuItem>
                          ) : null}
                        </MenuContent>
                      </Menu>
                    ) : null}
                  </span>
                }
              />
            </li>
          );
        })}
      </ul>
      {confirmDialog}
    </>
  );
}
