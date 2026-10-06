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

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/**
 * `PATCH /api/places/[placeId]` (managers). Only these fields; name, slug, category,
 * coordinates, radius and verification are admin-only (strict → 400 otherwise). Owners may list
 * or unlist a Place once Click has verified it.
 */
export const placeManagerPatchBodySchema = z
  .object({
    description: optionalText(500),
    hours: z.unknown().optional(),
    website_url: optionalText(500),
    hub_enabled: z.boolean().optional(),
    listed: z.boolean().optional(),
    /** Owner moves a legacy `draft` Place into Click's review queue (spec §9.5). */
    submit_for_review: z.literal(true).optional(),
    address_line: optionalText(200),
    city: optionalText(100),
    region: optionalText(100),
    postal_code: optionalText(20),
  })
  .strict();
export type PlaceManagerPatchBody = z.infer<typeof placeManagerPatchBodySchema>;

/** `POST /api/places` — a business submits its own Place for review (self-serve setup). */
export const placeCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_meters: z.number().int().min(25).max(750).optional(),
  timezone: z.string().max(64),
  address_line: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional(),
  postal_code: z.string().trim().max(20).optional(),
  country_code: z.string().trim().length(2).optional(),
  website_url: z.string().trim().url().max(500).startsWith('https://').optional(),
});
