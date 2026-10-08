import { instantFromWallClock, wallClockInZone, type WallClock } from '@/lib/events/zonedTime';
import type { TierInput } from '@/lib/ticketing/ticketingClient';
import type { ManagedTier } from '@/lib/ticketing/types';

/** A ticket type as the organizer types it: text fields stay text until saved. */
export type TierDraft = {
  name: string;
  description: string;
  priceText: string;
  capacityText: string;
  maxPerOrderText: string;
  salesStart: WallClock | null;
  salesEnd: WallClock | null;
};

export type TierDraftErrors = Partial<Record<'name' | 'price' | 'capacity' | 'maxPerOrder' | 'window', string>>;

/** Matches the API's limits (`lib/api/schemas/ticketing.ts`). */
const MAX_UNIT_AMOUNT = 1_000_000;
const MAX_CAPACITY = 100_000;

export function emptyTierDraft(): TierDraft {
  return { name: '', description: '', priceText: '', capacityText: '', maxPerOrderText: '8', salesStart: null, salesEnd: null };
}

/** "$15", "15.5", "1,200" → cents; null when it isn't a price. */
export function parsePriceText(text: string): number | null {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]!.replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → the text a person would type: "15", "15.50". */
export function priceText(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function tierDraftFrom(tier: ManagedTier, timeZone: string): TierDraft {
  return {
    name: tier.name,
    description: tier.description ?? '',
    priceText: priceText(tier.unit_amount),
    capacityText: String(tier.capacity),
    maxPerOrderText: String(tier.max_per_order),
    salesStart: tier.sales_start_at ? wallClockInZone(tier.sales_start_at, timeZone) : null,
    salesEnd: tier.sales_end_at ? wallClockInZone(tier.sales_end_at, timeZone) : null,
  };
}

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

/**
 * Checks a draft the way the API will, with copy a host can act on, and builds the request
 * body. `sold` and `wasPaid` describe the saved tier being edited (0 / null for a new one).
 */
export function validateTierDraft(
  draft: TierDraft,
  ctx: { sold: number; timeZone: string; wasPaid: boolean | null },
): { errors: TierDraftErrors; body: TierInput | null } {
  const errors: TierDraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Name your ticket';

  // Blank means free (spec §5.1).
  const unitAmount = draft.priceText.trim() ? parsePriceText(draft.priceText) : 0;
  if (unitAmount == null) errors.price = 'Enter a price like 15 or 15.00';
  else if (unitAmount > MAX_UNIT_AMOUNT) errors.price = 'Enter a price up to $10,000';
  else if (ctx.sold > 0 && ctx.wasPaid != null && unitAmount > 0 !== ctx.wasPaid) {
    errors.price = 'This ticket has sales, so it can’t switch between free and paid';
  }

  const capacity = wholeNumber(draft.capacityText);
  if (capacity == null || capacity < 1) errors.capacity = 'Capacity must be at least 1';
  else if (capacity > MAX_CAPACITY) errors.capacity = 'Capacity can be at most 100,000';
  else if (capacity < ctx.sold) errors.capacity = `${ctx.sold} already sold, so capacity can’t go lower`;

  const maxPerOrder = wholeNumber(draft.maxPerOrderText);
  if (maxPerOrder == null || maxPerOrder < 1 || maxPerOrder > 20) errors.maxPerOrder = 'Choose 1 to 20';

  const start = draft.salesStart ? instantFromWallClock(draft.salesStart, ctx.timeZone) : null;
  const end = draft.salesEnd ? instantFromWallClock(draft.salesEnd, ctx.timeZone) : null;
  if (start && end && end.getTime() <= start.getTime()) errors.window = 'Sales must end after they start';

  if (Object.keys(errors).length) return { errors, body: null };
  return {
    errors,
    body: {
      name,
      description: draft.description.trim() || null,
      unit_amount: unitAmount!,
      capacity: capacity!,
      max_per_order: maxPerOrder!,
      sales_start_at: start?.toISOString() ?? null,
      sales_end_at: end?.toISOString() ?? null,
    },
  };
}
