import { z } from 'zod';
import { isRecord, pickDualNumber } from '@/lib/api/schemas/common';

function pickString(raw: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function pickBool(raw: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    if (typeof raw[key] === 'boolean') return raw[key] as boolean;
  }
  return undefined;
}

/** `POST /api/places/[placeId]/check-in` — accepts lat/lng/lon aliases like engagement telemetry. */
export const placeCheckInBodySchema = z.preprocess(
  (raw) => {
    if (!isRecord(raw)) return {};
    return {
      latitude: pickDualNumber(raw, 'latitude', 'lat'),
      longitude: pickDualNumber(raw, 'longitude', 'lng') ?? pickDualNumber(raw, 'longitude', 'lon'),
      accuracy_meters: pickDualNumber(raw, 'accuracy_meters', 'accuracyMeters') ?? pickDualNumber(raw, 'accuracy', 'horizontalAccuracy'),
      anchor_token: pickString(raw, 'anchor_token', 'anchorToken'),
      share_with_connections: pickBool(raw, 'share_with_connections', 'shareWithConnections'),
      platform: pickString(raw, 'platform'),
      app_version: pickString(raw, 'app_version', 'appVersion'),
    };
  },
  z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    accuracy_meters: z.number().nonnegative().optional(),
    anchor_token: z.string().max(64).optional(),
    share_with_connections: z.boolean().optional(),
    platform: z.string().max(16).optional(),
    app_version: z.string().max(32).optional(),
  }),
);
export type PlaceCheckInBody = z.infer<typeof placeCheckInBodySchema>;

const nullableInt = z.number().int().nullable().optional();

/** `POST /api/places/[placeId]/pulse`. Ranges are checked by the route (400 `invalid_answer`). */
export const placePulseBodySchema = z
  .object({
    energy: nullableInt,
    talkable: nullableInt,
    category_answer: nullableInt,
    would_return: nullableInt,
    question_version: z.number().int().optional(),
  })
  .passthrough();
export type PlacePulseBody = z.infer<typeof placePulseBodySchema>;

/** `PATCH /api/places/[placeId]/pulse/[pulseId]` — fill a still-empty follow-up. */
export const placePulsePatchBodySchema = z
  .object({
    talkable: nullableInt,
    category_answer: nullableInt,
  })
  .passthrough();
export type PlacePulsePatchBody = z.infer<typeof placePulsePatchBodySchema>;
