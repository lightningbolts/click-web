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

export const createTierBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  unit_amount: z.number().int().min(0).max(1_000_000),
  capacity: z.number().int().min(0).max(100_000),
  max_per_order: z.number().int().min(1).max(20).default(8),
  max_per_user: z.number().int().min(1).max(100).nullish(),
  sales_start_at: z.string().datetime({ offset: true }).nullish(),
  sales_end_at: z.string().datetime({ offset: true }).nullish(),
  sort_order: z.number().int().min(0).max(1000).default(0),
});

export const ticketingStatusBodySchema = z.object({
  ticketing_status: z.enum(['draft', 'sales_open', 'sales_paused', 'sales_closed']),
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
