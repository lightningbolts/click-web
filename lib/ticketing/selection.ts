import { formatMoney } from '@/lib/ticketing/money';
import type { TicketOffering } from '@/lib/ticketing/types';

/** Quantity picked per tier id. */
export type Selection = Record<string, number>;

export type SelectionTotal = {
  lines: { name: string; quantity: number; amount: number }[];
  total: number;
  isFree: boolean;
  count: number;
};

/** Keeps only tiers still on sale, each capped at what the buyer may take now. */
export function clampSelection(selection: Selection, offerings: readonly TicketOffering[]): Selection {
  const clamped: Selection = {};
  for (const offering of offerings) {
    const wanted = selection[offering.id] ?? 0;
    if (offering.availability !== 'on_sale' || wanted <= 0) continue;
    const quantity = Math.min(wanted, offering.max_quantity);
    if (quantity > 0) clamped[offering.id] = quantity;
  }
  return clamped;
}

/** The order summary, in the organizer's tier order. */
export function selectionTotal(selection: Selection, offerings: readonly TicketOffering[]): SelectionTotal {
  const lines = offerings
    .filter((offering) => (selection[offering.id] ?? 0) > 0)
    .map((offering) => ({
      name: offering.name,
      quantity: selection[offering.id]!,
      amount: offering.unit_amount * selection[offering.id]!,
    }));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return { lines, total, isFree: count > 0 && total === 0, count };
}

export function ctaLabel(summary: Pick<SelectionTotal, 'total' | 'isFree' | 'count'>, currency: string): string {
  if (summary.count === 0) return 'Get tickets';
  if (summary.isFree) return summary.count === 1 ? 'Claim free ticket' : 'Claim free tickets';
  return `Checkout · ${formatMoney(summary.total, currency)}`;
}
