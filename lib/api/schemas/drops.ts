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
