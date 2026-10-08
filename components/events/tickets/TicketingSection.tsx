"use client";

import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ds/Button";
import { useConfirm } from "@/components/ds/ConfirmDialog";
import { IconButton } from "@/components/ds/IconButton";
import { InlineNotice } from "@/components/ds/InlineNotice";
import { ListGroup, ListRow } from "@/components/ds/ListGroup";
import { SegmentedControl } from "@/components/ds/SegmentedControl";
import { Skeleton } from "@/components/ds/Skeleton";
import { StatusPill } from "@/components/ds/StatusPill";
import { toast } from "@/components/ds/Toast";
import { Toggle } from "@/components/ds/Toggle";
import { TicketTierSheet } from "@/components/events/tickets/TicketTierSheet";
import { instantFromWallClock } from "@/lib/events/zonedTime";
import { assignLocation } from "@/lib/navigation/assignLocation";
import { formatMoney } from "@/lib/ticketing/money";
import {
  TicketingError,
  connectOnboardingUrl,
  createTier,
  deleteTier,
  fetchManagedTiers,
  setTicketingStatus,
  ticketingErrorMessage,
  updateTier,
  type TierInput,
} from "@/lib/ticketing/ticketingClient";
import { emptyTierDraft, parsePriceText, tierDraftFrom, type TierDraft } from "@/lib/ticketing/tierForm";
import type { ManagedTier, TicketingStatus } from "@/lib/ticketing/types";

type LiveStatus = Extract<TicketingStatus, "sales_open" | "sales_paused" | "sales_closed">;
const LIVE: readonly LiveStatus[] = ["sales_open", "sales_paused", "sales_closed"];

const SALES_HELP: Record<LiveStatus, string> = {
  sales_open: "Guests can get tickets now.",
  sales_paused: "Ticket sales are paused. Tickets already issued still work.",
  sales_closed: "Ticket sales are closed. Tickets already issued still work.",
};

/** What the sheet is editing: a local draft (create mode), a saved tier, or a new one. */
type Editing = { kind: "new" } | { kind: "draft"; index: number } | { kind: "tier"; tier: ManagedTier };

function errorCopy(e: unknown): string {
  const failure = e instanceof TicketingError ? e : new TicketingError(0, "network");
  if (failure.code === "organizer_not_ready") return "Set up payouts before selling paid tickets.";
  return ticketingErrorMessage(failure);
}

function salesEndLabel(iso: string | null, timeZone: string): string | null {
  if (!iso) return null;
  const at = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(
    Date.parse(iso),
  );
  return `Sales end ${at}`;
}

/**
 * Tickets in the event editor (spec §5.1). On a new event the ticket types are drafts the form
 * creates after the event exists; on a saved event every change goes straight to the API.
 */
export function TicketingSection({
  beaconId,
  timeZone,
  hasPaidAccount,
  initialStatus = null,
  disabledReason = null,
  onDraftsChange,
}: {
  beaconId?: string;
  timeZone: string;
  /** The host can take payments (Stripe Connect ready); null while unknown. */
  hasPaidAccount: boolean | null;
  /** Saved events: the current sales state, or null when the event uses RSVPs. */
  initialStatus?: TicketingStatus | null;
  /** Why tickets can't be turned on here (a repeating event), shown under the toggle. */
  disabledReason?: string | null;
  onDraftsChange?: (drafts: TierDraft[]) => void;
}) {
  const live = Boolean(beaconId);
  const { data: tiers, mutate } = useSWR(live ? ["managed-tiers", beaconId] : null, () => fetchManagedTiers(beaconId!));
  const [status, setStatus] = useState<TicketingStatus | null>(initialStatus);
  const [drafts, setDrafts] = useState<TierDraft[]>([]);
  const [wanted, setOn] = useState(initialStatus != null);
  // A reason to block tickets (a repeating new event) also sets drafts aside; saved events keep showing theirs.
  const on = wanted && (live || !disabledReason);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (!live) onDraftsChange?.(on ? drafts : []);
  }, [live, on, drafts, onDraftsChange]);

  const sold = (tiers ?? []).reduce((sum, t) => sum + t.sold, 0);
  const hasPaid = live ? (tiers ?? []).some((t) => t.unit_amount > 0) : drafts.some((d) => (parsePriceText(d.priceText) ?? 0) > 0);
  const locked = sold > 0;
  const openSheet = (next: Editing) => {
    setEditing(next);
    setSheetKey((k) => k + 1);
  };

  const toggle = async (next: boolean) => {
    if (next) {
      setOn(true);
      if (live && !tiers?.length) openSheet({ kind: "new" });
      return;
    }
    if (live && tiers?.length) {
      const ok = await confirm({
        title: "Turn off ticketing?",
        message: "Guests will RSVP instead. Your ticket types are kept if you turn it back on.",
        confirmLabel: "Turn off",
        destructive: true,
      });
      if (!ok) return;
      try {
        await setTicketingStatus(beaconId!, "disabled");
        setStatus(null);
      } catch (e) {
        toast.error(errorCopy(e));
        return;
      }
    }
    setOn(false);
  };

  const saveDraft = (index: number | null) => (_body: TierInput, draft: TierDraft) => {
    setDrafts((list) => (index == null ? [...list, draft] : list.map((d, i) => (i === index ? draft : d))));
    return true;
  };

  const saveTier = (tier: ManagedTier | null) => async (body: TierInput) => {
    try {
      if (tier) await updateTier(beaconId!, tier.id, body);
      else {
        await createTier(beaconId!, { ...body, sort_order: tiers?.length ?? 0 });
        // The first ticket type makes the event ticketed, in draft until sales open.
        if (status == null) setStatus("draft");
      }
      toast.success("Ticket saved");
      await mutate();
      return true;
    } catch (e) {
      toast.error(errorCopy(e));
      return false;
    }
  };

  const changeStatus = async (next: LiveStatus) => {
    const previous = status;
    setStatus(next);
    try {
      await setTicketingStatus(beaconId!, next);
    } catch (e) {
      setStatus(previous);
      toast.error(errorCopy(e));
    }
  };

  const hideOrShow = async (tier: ManagedTier) => {
    try {
      await updateTier(beaconId!, tier.id, { is_active: !tier.is_active });
      toast.success(tier.is_active ? "Ticket hidden" : "Ticket shown");
      await mutate();
    } catch (e) {
      toast.error(errorCopy(e));
    }
  };

  const remove = async (tier: ManagedTier) => {
    const ok = await confirm({
      title: `Delete ${tier.name}?`,
      message: "No one has bought this ticket yet, so it’s removed for good.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTier(beaconId!, tier.id);
      toast.success("Ticket deleted");
      await mutate();
    } catch (e) {
      toast.error(errorCopy(e));
    }
  };

  const setUpPayouts = async () => {
    setBusy(true);
    try {
      assignLocation(await connectOnboardingUrl());
    } catch (e) {
      toast.error(errorCopy(e));
      setBusy(false);
    }
  };

  const footer = disabledReason
    ? disabledReason
    : locked
      ? "Tickets have been issued, so ticketing can’t be turned off."
      : on
        ? "Guests get a ticket instead of an RSVP. Buyers pay no fees."
        : "Guests RSVP for free. Turn this on to sell tickets or hand out free ones.";

  const rows = live
    ? (tiers ?? []).map((tier) => {
        const remaining = Math.max(tier.capacity - tier.sold - tier.held, 0);
        const end = salesEndLabel(tier.sales_end_at, timeZone);
        return (
          <ListRow
            key={tier.id}
            title={
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{tier.name}</span>
                {!tier.is_active ? <StatusPill variant="neutral">Hidden</StatusPill> : remaining === 0 ? <StatusPill variant="warning">Sold out</StatusPill> : null}
              </span>
            }
            subtitle={
              <>
                <span className="tabular">
                  {formatMoney(tier.unit_amount, tier.currency)} · {remaining} / {tier.capacity} left
                </span>
                {end ? <span className="block truncate">{end}</span> : null}
              </>
            }
            trailing={
              <span className="flex items-center gap-1">
                <IconButton icon={Pencil} size="sm" aria-label={`Edit ${tier.name}`} onClick={() => openSheet({ kind: "tier", tier })} />
                {tier.sold > 0 ? (
                  <IconButton
                    icon={tier.is_active ? EyeOff : Eye}
                    size="sm"
                    aria-label={`${tier.is_active ? "Hide" : "Show"} ${tier.name}`}
                    onClick={() => void hideOrShow(tier)}
                  />
                ) : (
                  <IconButton icon={Trash2} size="sm" aria-label={`Delete ${tier.name}`} onClick={() => void remove(tier)} />
                )}
              </span>
            }
          />
        );
      })
    : drafts.map((draft, index) => {
        const endAt = draft.salesEnd ? instantFromWallClock(draft.salesEnd, timeZone) : null;
        const end = salesEndLabel(endAt?.toISOString() ?? null, timeZone);
        return (
          <ListRow
            key={index}
            title={draft.name}
            subtitle={
              <>
                <span className="tabular">
                  {formatMoney(parsePriceText(draft.priceText) ?? 0, "usd")} · {draft.capacityText} tickets
                </span>
                {end ? <span className="block truncate">{end}</span> : null}
              </>
            }
            trailing={
              <span className="flex items-center gap-1">
                <IconButton icon={Pencil} size="sm" aria-label={`Edit ${draft.name}`} onClick={() => openSheet({ kind: "draft", index })} />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  aria-label={`Delete ${draft.name}`}
                  onClick={() => setDrafts((list) => list.filter((_, i) => i !== index))}
                />
              </span>
            }
          />
        );
      });

  const editingTier = editing?.kind === "tier" ? editing.tier : null;
  const sheetInitial =
    editing?.kind === "tier" ? tierDraftFrom(editing.tier, timeZone) : editing?.kind === "draft" ? drafts[editing.index]! : emptyTierDraft();

  return (
    <section aria-labelledby="event-tickets-heading" className="space-y-4" data-testid="event-ticketing">
      <ListGroup header={<span id="event-tickets-heading">Tickets</span>} footer={footer}>
        <ListRow
          title="Sell or hand out tickets"
          trailing={
            <Toggle
              aria-label="Sell or hand out tickets"
              checked={on}
              disabled={Boolean(disabledReason) || locked}
              onCheckedChange={(next) => void toggle(next)}
            />
          }
        />
      </ListGroup>

      {on ? (
        <>
          {live && !tiers ? (
            <Skeleton rounded="lg" className="h-16 w-full" />
          ) : (
            <ListGroup
              aria-label="Ticket types"
              footer={live && (tiers ?? []).some((t) => t.sold > 0) ? "Ticket types with sales can be hidden, not deleted." : undefined}
            >
              {rows}
              <ListRow icon={Plus} title="Add ticket type" onClick={() => openSheet({ kind: "new" })} className="text-accent" />
            </ListGroup>
          )}

          {hasPaid && hasPaidAccount === false ? (
            <InlineNotice
              variant="warning"
              action={
                live ? (
                  <Button size="sm" variant="plain" loading={busy} onClick={() => void setUpPayouts()}>
                    Set up payouts
                  </Button>
                ) : undefined
              }
            >
              Set up payouts to sell paid tickets
            </InlineNotice>
          ) : null}

          {live && (status === "draft" || status === "ready") && tiers?.length ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
              <p className="type-body text-fg">Sales aren’t open yet</p>
              <Button size="sm" variant="primary" onClick={() => void changeStatus("sales_open")}>
                Open sales
              </Button>
            </div>
          ) : live && status && (LIVE as readonly string[]).includes(status) ? (
            <section aria-label="Ticket sales">
              <h3 className="type-meta mb-2 px-4 font-semibold text-fg-secondary">Sales</h3>
              <SegmentedControl<LiveStatus>
                fullWidth
                label="Ticket sales"
                value={status as LiveStatus}
                onChange={(next) => void changeStatus(next)}
                segments={[
                  { value: "sales_open", label: "Open" },
                  { value: "sales_paused", label: "Paused" },
                  { value: "sales_closed", label: "Closed" },
                ]}
              />
              <p className="type-meta mt-2 px-4 text-fg-tertiary">{SALES_HELP[status as LiveStatus]}</p>
            </section>
          ) : null}
        </>
      ) : null}

      {editing ? (
        <TicketTierSheet
          key={sheetKey}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          initial={sheetInitial}
          isNew={editing.kind === "new"}
          sold={editingTier?.sold ?? 0}
          wasPaid={editingTier ? editingTier.unit_amount > 0 : null}
          timeZone={timeZone}
          onSave={live ? saveTier(editingTier) : saveDraft(editing.kind === "draft" ? editing.index : null)}
        />
      ) : null}
      {confirmDialog}
    </section>
  );
}
