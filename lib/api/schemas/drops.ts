import { z } from 'zod';
import { DROP_KINDS, type DropKind } from '@/lib/drops/developState';

const uuid = z.string().trim().uuid();
const dropKind = z.enum(DROP_KINDS as [DropKind, ...DropKind[]]);

/** POST /api/drops/develop — one drop, or a screen's "Develop all" (bounded). */
export const dropDevelopBodySchema = z.object({
  drops: z.array(z.object({ kind: dropKind, id: uuid })).min(1).max(50),
});

/** GET /api/drops/views?kind=chat&ids=a,b — the viewer's developed state for up to 100 drops. */
export const dropViewsQuerySchema = z.object({
  kind: dropKind,
  ids: z
    .string()
    .transform((raw) => [...new Set(raw.split(',').map((id) => id.trim()).filter(Boolean))])
    .pipe(z.array(uuid).min(1).max(100)),
});

const base64 = z.string().min(4).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64');

/** POST /api/beacons/{id}/drops — one event drop: the original plus its pixelated preview. */
export const eventDropCreateBodySchema = z.object({
  client_drop_id: uuid,
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  original_b64: base64,
  preview_b64: base64,
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  show_to_absentees: z.boolean().optional(),
});

/** PUT /api/beacons/{id}/drops/settings — the poster's per-event absentee choice. */
export const eventDropSettingsBodySchema = z.object({ show_to_absentees: z.boolean() });

/** POST /api/drops/report — a quiet report on any drop the reporter can see. */
export const dropReportBodySchema = z.object({
  kind: dropKind,
  id: uuid,
  reason: z.string().trim().min(1).max(500),
});

export const SHARED_DROP_CAPTION_MAX = 100;

/** POST /api/me/shared-drops — one drop to all or core connections (original + pixelated preview). */
export const sharedDropCreateBodySchema = z.object({
  client_drop_id: uuid,
  audience: z.enum(['all', 'core']),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  original_b64: base64,
  preview_b64: base64,
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  /** Locket-style caption: up to 100 characters as people count them (emoji count once). */
  caption: z
    .string()
    .trim()
    // Same unit as the database backstop (char_length counts code points, not UTF-16 units).
    .refine((s) => [...s].length <= 1000, 'Caption is too long.')
    .refine((s) => [...new Intl.Segmenter().segment(s)].length <= SHARED_DROP_CAPTION_MAX, 'Caption is too long.')
    .transform((s) => s || undefined)
    .optional(),
});
