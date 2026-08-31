import { z } from 'zod';
import {
  isRecord,
  nonEmptyString,
  optionalNonEmptyString,
  pickDualNumber,
} from '@/lib/api/schemas/common';

/** Loose engagement telemetry — normalizes aliases; all fields optional (matches parseEngagementTelemetryBody leniency). */
export const engagementTelemetryBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return {};
  const latitude = pickDualNumber(raw, 'latitude', 'lat');
  const longitude =
    pickDualNumber(raw, 'longitude', 'lng') ?? pickDualNumber(raw, 'longitude', 'lon');
  const accuracy_meters = pickDualNumber(raw, 'accuracy_meters', 'accuracyMeters');
  const client_occurred_at =
    typeof raw.client_occurred_at === 'string'
      ? raw.client_occurred_at
      : typeof raw.clientOccurredAt === 'string'
        ? raw.clientOccurredAt
        : undefined;
  const app_version =
    typeof raw.app_version === 'string'
      ? raw.app_version
      : typeof raw.appVersion === 'string'
        ? raw.appVersion
        : undefined;
  return {
    ...raw,
    latitude,
    longitude,
    accuracy_meters,
    client_occurred_at,
    app_version,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    platform: typeof raw.platform === 'string' ? raw.platform : undefined,
    surface: typeof raw.surface === 'string' ? raw.surface : undefined,
    bookmarked: typeof raw.bookmarked === 'boolean' ? raw.bookmarked : undefined,
    share_url: typeof raw.share_url === 'string' ? raw.share_url : undefined,
  };
}, z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy_meters: z.number().optional(),
  client_occurred_at: z.string().optional(),
  source: z.string().optional(),
  platform: z.string().optional(),
  app_version: z.string().optional(),
  surface: z.string().optional(),
  bookmarked: z.boolean().optional(),
  share_url: z.string().optional(),
}).passthrough());

export const beaconCreateBodySchema = z.record(z.string(), z.unknown());

export const beaconPatchBodySchema = z.object({
  show_creator_name: z.unknown().optional(),
  metadata: z.unknown().optional(),
  expires_at: z.unknown().optional(),
  ttl_ms: z.unknown().optional(),
}).passthrough();

export const hubCreateBodySchema = z.object({
  name: optionalNonEmptyString,
  category: optionalNonEmptyString,
  location: z.unknown().optional(),
}).passthrough();

export const hubMessagesBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const hub_id =
    typeof raw.hub_id === 'string'
      ? raw.hub_id
      : typeof raw.hubId === 'string'
        ? raw.hubId
        : undefined;
  return { ...raw, hub_id };
}, z.object({
  hub_id: nonEmptyString,
  body: z.unknown().optional(),
  user_lat: z.unknown().optional(),
  user_long: z.unknown().optional(),
  message_type: z.unknown().optional(),
  metadata: z.unknown().optional(),
}).passthrough());

export const hubJoinBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const hub_id =
    typeof raw.hub_id === 'string'
      ? raw.hub_id
      : typeof raw.hubId === 'string'
        ? raw.hubId
        : undefined;
  return { ...raw, hub_id };
}, z.object({
  hub_id: nonEmptyString,
}).passthrough());

export const hubLeaveBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const hub_id =
    typeof raw.hub_id === 'string'
      ? raw.hub_id
      : typeof raw.hubId === 'string'
        ? raw.hubId
        : undefined;
  return { ...raw, hub_id };
}, z.object({
  hub_id: nonEmptyString,
}).passthrough());

export const hubPatchBodySchema = z.object({
  name: optionalNonEmptyString,
  category: optionalNonEmptyString,
}).passthrough();

export const eventRsvpRequestActionSchema = z.object({
  user_id: z.string().trim().min(1),
  action: z.enum(['approve', 'deny']).optional(),
});

export const guestRsvpBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  contact: z.string().min(1),
});

export const guestListBodySchema = z.object({
  source: z.enum(['csv', 'manual', 'instagram_import']).optional(),
  csv_text: z.string().max(500_000).optional(),
  entries: z
    .array(
      z.object({
        email: z.string().optional().nullable(),
        instagram_handle: z.string().optional().nullable(),
      }),
    )
    .max(2000)
    .optional(),
});

export const nudgeSnoozeBodySchema = z.object({
  days: z.union([z.literal(7), z.literal(30)]).optional(),
});
