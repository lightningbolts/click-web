import { z } from 'zod';
import {
  connectionIdBodySchema,
  nonEmptyString,
  optionalNonEmptyString,
  withDualId,
} from '@/lib/api/schemas/common';

export { connectionIdBodySchema };

export const safetyReportBodySchema = z.preprocess(
  withDualId('connection_id', 'connectionId'),
  z.object({
    connection_id: nonEmptyString,
    reason: nonEmptyString,
  }),
);

export const safetyBlockBodySchema = z.object({
  blocked_id: nonEmptyString,
});

export const chatCreateBodySchema = z.preprocess(
  withDualId('connection_id', 'connectionId', 'connectionId'),
  z.object({
    connectionId: nonEmptyString,
  }),
);

export const venueVibeBodySchema = z.object({
  rating: z.number().min(1).max(5).optional().nullable(),
  category: optionalNonEmptyString.nullable().optional(),
  message: z.string().trim().max(2000).optional().nullable(),
}).refine(
  (b) =>
    (typeof b.rating === 'number' && b.rating >= 1 && b.rating <= 5) ||
    (typeof b.message === 'string' && b.message.trim().length > 0),
  { message: 'Provide at least a 1–5 rating or a short message' },
);

export const collaborationSessionBodySchema = z.object({
  timezone_offset_minutes: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const tagsBodySchema = z.object({
  contextTag: z.unknown().optional(),
  context_tags: z.unknown().optional(),
  noiseLevel: z.unknown().optional(),
  noise_level: z.unknown().optional(),
  height_category: z.unknown().optional(),
  elevation_category: z.unknown().optional(),
  exact_noise_level_db: z.unknown().optional(),
  exact_barometric_elevation_m: z.unknown().optional(),
}).passthrough();

export const cliquesMembersBodySchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  const group_id =
    typeof o.group_id === 'string'
      ? o.group_id
      : typeof o.groupId === 'string'
        ? o.groupId
        : undefined;
  const new_member_user_id =
    typeof o.new_member_user_id === 'string'
      ? o.new_member_user_id
      : typeof o.newMemberUserId === 'string'
        ? o.newMemberUserId
        : undefined;
  const member_user_id =
    typeof o.member_user_id === 'string'
      ? o.member_user_id
      : typeof o.memberUserId === 'string'
        ? o.memberUserId
        : undefined;
  return { ...o, group_id, new_member_user_id, member_user_id };
}, z.object({
  group_id: nonEmptyString,
  new_member_user_id: optionalNonEmptyString,
  member_user_id: optionalNonEmptyString,
}).passthrough());

export const enrichmentEventBodySchema = z.object({
  encounter_id: nonEmptyString,
  lat: z.number().optional(),
  lon: z.number().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export const proximityConfirmBodySchema = z.object({
  pending_handshake_id: nonEmptyString,
  selected_member_ids: z.array(z.string()).min(1),
  context_tags: z.unknown().optional(),
}).passthrough();

export const encounterBodySchema = z.object({
  connection_id: optionalNonEmptyString,
  user_id: optionalNonEmptyString,
  peer_id: optionalNonEmptyString,
  sensor_data: z.unknown().optional(),
  open_disposable_roll: z.unknown().optional(),
  timezone_offset_minutes: z.unknown().optional(),
}).passthrough();

/** Proximity bind — intentionally loose to mirror ProximityHandshakeRequest. */
export const proximityHandshakeBodySchema = z.record(z.string(), z.unknown());

export const connectionsPatchBodySchema = z.object({
  action: optionalNonEmptyString,
  connectionId: optionalNonEmptyString,
  id: optionalNonEmptyString,
}).passthrough();

/** Full connection create — passthrough after ensuring object. */
export const connectionsCreateBodySchema = z.record(z.string(), z.unknown());

export const qrScanBodySchema = z.record(z.string(), z.unknown());
