"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { IconButton } from "@/components/ds/IconButton";
import { Sheet } from "@/components/ds/Sheet";
import { TextArea, TextField } from "@/components/ds/TextField";
import { compactField } from "@/components/events/EventFormSections";
import { cn } from "@/lib/cn";
import type { WallClock } from "@/lib/events/zonedTime";
import type { TierInput } from "@/lib/ticketing/ticketingClient";
import { validateTierDraft, type TierDraft, type TierDraftErrors } from "@/lib/ticketing/tierForm";

function WindowField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: WallClock | null;
  onChange: (value: WallClock | null) => void;
  invalid: boolean;
}) {
  const set = (patch: Partial<WallClock>) => {
    const next = { date: value?.date ?? "", time: value?.time ?? "", ...patch };
    onChange(next.date || next.time ? { date: next.date, time: next.time || "00:00" } : null);
  };
  return (
    <div>
      <p id={id} className="type-body mb-1.5 text-fg">
        {label}
      </p>
      <div className={cn("grid items-center gap-2", value ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-2")}>
        <input
          type="date"
          aria-label={`${label} date`}
          aria-invalid={invalid || undefined}
          className={cn(compactField, "w-full min-w-0")}
          value={value?.date ?? ""}
          onChange={(e) => set({ date: e.target.value })}
        />
        <input
          type="time"
          step={300}
          aria-label={`${label} time`}
          aria-invalid={invalid || undefined}
          className={cn(compactField, "w-full min-w-0")}
          value={value?.time ?? ""}
          onChange={(e) => set({ time: e.target.value })}
        />
        {value ? <IconButton icon={X} size="sm" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)} /> : null}
      </div>
    </div>
  );
}

/**
 * Add or edit one ticket type (spec §5.1). Validates as you type once a save was tried, and
 * stays open with the problems marked until the save goes through.
 */
export function TicketTierSheet({
  open,
  onOpenChange,
  initial,
  isNew,
  sold,
  wasPaid,
  timeZone,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TierDraft;
  isNew: boolean;
  /** Tickets already sold of the tier being edited (0 for a new one). */
  sold: number;
  wasPaid: boolean | null;
  timeZone: string;
  /** Resolves true when saved; the sheet then closes. */
  onSave: (body: TierInput, draft: TierDraft) => Promise<boolean> | boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const { errors, body } = validateTierDraft(draft, { sold, timeZone, wasPaid });
  const shown: TierDraftErrors = tried ? errors : {};
  const set = (patch: Partial<TierDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setTried(true);
    if (!body) return;
    setSaving(true);
    try {
      if (await onSave(body, draft)) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? "New ticket type" : "Edit ticket type"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="plain" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Name"
          value={draft.name}
          maxLength={120}
          placeholder="General admission"
          autoComplete="off"
          error={shown.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <TextArea
          label="Description"
          value={draft.description}
          maxLength={2000}
          rows={2}
          placeholder="What’s included (optional)"
          onChange={(e) => set({ description: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Price"
            value={draft.priceText}
            inputMode="decimal"
            placeholder="Free"
            help={shown.price ? undefined : "Leave blank for free"}
            error={shown.price}
            onChange={(e) => set({ priceText: e.target.value })}
          />
          <TextField
            label="Capacity"
            value={draft.capacityText}
            inputMode="numeric"
            placeholder="100"
            error={shown.capacity}
            help={!shown.capacity && sold > 0 ? `${sold} sold` : undefined}
            onChange={(e) => set({ capacityText: e.target.value })}
          />
        </div>
        <TextField
          label="Max per order"
          value={draft.maxPerOrderText}
          inputMode="numeric"
          error={shown.maxPerOrder}
          onChange={(e) => set({ maxPerOrderText: e.target.value })}
        />
        <fieldset className="space-y-2">
          <legend className="type-meta mb-2 font-semibold text-fg-secondary">Sales window (optional)</legend>
          <WindowField id="tier-sales-start" label="Starts" value={draft.salesStart} onChange={(salesStart) => set({ salesStart })} invalid={Boolean(shown.window)} />
          <WindowField id="tier-sales-end" label="Ends" value={draft.salesEnd} onChange={(salesEnd) => set({ salesEnd })} invalid={Boolean(shown.window)} />
          {shown.window ? (
            <p role="alert" className="type-meta text-destructive">
              {shown.window}
            </p>
          ) : (
            <p className="type-meta text-fg-tertiary">Without one, sales stay open until you close them.</p>
          )}
        </fieldset>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  );
}
