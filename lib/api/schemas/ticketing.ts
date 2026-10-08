import { z } from 'zod';

export const checkoutBodySchema = z.object({
  items: z
    .array(
      z.object({
        ticket_tier_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(5),
});

const tierFields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  unit_amount: z.number().int().min(0).max(1_000_000),
  capacity: z.number().int().min(0).max(100_000),
  max_per_order: z.number().int().min(1).max(20),
  max_per_user: z.number().int().min(1).max(100).nullish(),
  sales_start_at: z.string().datetime({ offset: true }).nullish(),
  sales_end_at: z.string().datetime({ offset: true }).nullish(),
  sort_order: z.number().int().min(0).max(1000),
};

export const createTierBodySchema = z.object({
  ...tierFields,
  max_per_order: tierFields.max_per_order.default(8),
  sort_order: tierFields.sort_order.default(0),
});

export type CreateTierBody = z.input<typeof createTierBodySchema>;

/** Every field optional; only the keys sent are changed. */
export const updateTierBodySchema = z
  .object({ ...tierFields, is_active: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });

export type UpdateTierBody = z.input<typeof updateTierBodySchema>;

/** True when both ends are set and the window ends at or before it starts. */
export function salesWindowInverted(start?: string | null, end?: string | null): boolean {
  return Boolean(start && end && Date.parse(end) <= Date.parse(start));
}

export const ticketingStatusBodySchema = z.object({
  ticketing_status: z.enum(['disabled', 'draft', 'sales_open', 'sales_paused', 'sales_closed']),
  ticket_sales_start_at: z.string().datetime({ offset: true }).nullish(),
  ticket_sales_end_at: z.string().datetime({ offset: true }).nullish(),
});

export const checkInBodySchema = z.object({
  credential: z.string().min(16).max(512),
  device_metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const refundBodySchema = z.object({
  ticket_ids: z.array(z.string().uuid()).max(50).nullish(),
  reason: z.string().trim().max(500).nullish(),
});
