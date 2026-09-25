import { money } from "@/lib/ticketing/format";
import type { TicketTier } from "@/lib/ticketing/types";
export default function TicketCheckoutSummary({
  tiers,
  quantities,
}: {
  tiers: TicketTier[];
  quantities: Record<string, number>;
}) {
  const total = tiers.reduce((sum, t) => sum + t.unit_amount * (quantities[t.id] ?? 0), 0);
  return (
    <p aria-live="polite">
      Estimated total: <strong>{money(total, tiers[0]?.currency)}</strong>. Final pricing is
      confirmed at checkout.
    </p>
  );
}
