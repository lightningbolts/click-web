import { z } from 'zod';
import {
  isRecord,
  nonEmptyString,
  optionalNonEmptyString,
} from '@/lib/api/schemas/common';

export const pushTokensBodySchema = z.object({
  token: nonEmptyString,
  platform: optionalNonEmptyString,
  token_type: optionalNonEmptyString,
  device_id: optionalNonEmptyString,
}).passthrough();

export const preferencesBodySchema = z.object({
  message_push_enabled: z.boolean().optional(),
  call_push_enabled: z.boolean().optional(),
  event_reminder_push_enabled: z.boolean().optional(),
  availability_match_push_enabled: z.boolean().optional(),
  hub_message_push_enabled: z.boolean().optional(),
  event_teaser_push_enabled: z.boolean().optional(),
  reconnect_nudge_push_enabled: z.boolean().optional(),
}).passthrough();

export const availabilityBodySchema = z.object({
  preferred_activities: z.unknown().optional(),
  available_days: z.unknown().optional(),
  is_free_this_week: z.unknown().optional(),
  custom_status: z.unknown().optional(),
}).passthrough();

export const availabilityIntentBodySchema = z.object({
  intent_tag: optionalNonEmptyString,
  timeframe: z.unknown().optional(),
  durationMs: z.unknown().optional(),
}).passthrough();

export const userProfilePatchBodySchema = z.record(z.string(), z.unknown());

export const avatarJsonBodySchema = z.object({
  file_b64: nonEmptyString,
  mime_type: optionalNonEmptyString,
}).passthrough();

export const groupAvatarBodySchema = z.object({
  file_b64: nonEmptyString,
  mime_type: optionalNonEmptyString,
}).passthrough();

export const authBodySchema = z.object({
  email: optionalNonEmptyString,
  password: z.string().optional(),
  action: optionalNonEmptyString,
  first_name: optionalNonEmptyString,
  last_name: optionalNonEmptyString,
  birthday: z.unknown().optional(),
}).passthrough();

export const timelinePostBodySchema = z.object({
  target_type: optionalNonEmptyString,
  target_id: optionalNonEmptyString,
  body: z.unknown().optional(),
  visibility: z.unknown().optional(),
}).passthrough();

export const timelinePutBodySchema = z.object({
  id: nonEmptyString,
  body: z.unknown().optional(),
  visibility: z.unknown().optional(),
}).passthrough();

export const timelineDeleteBodySchema = z.object({
  id: nonEmptyString,
}).passthrough();

export const displayNamesBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const userIds = Array.isArray(raw.userIds)
    ? raw.userIds
    : Array.isArray(raw.user_ids)
      ? raw.user_ids
      : undefined;
  return { ...raw, userIds };
}, z.object({
  userIds: z.array(z.string()).min(1),
}).passthrough());

export const waitlistBodySchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  source: z.string().trim().min(1).max(200).optional(),
  referrer_user_id: z.string().uuid().optional(),
});

export const frictionTelemetryBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const event =
    typeof raw.event === 'string'
      ? raw.event
      : typeof raw.event_type === 'string'
        ? raw.event_type
        : undefined;
  return { ...raw, event };
}, z.object({
  event: optionalNonEmptyString,
  duration_sec: z.unknown().optional(),
  pan_count: z.unknown().optional(),
  action_taken: z.unknown().optional(),
  hexbin_id: z.unknown().optional(),
}).passthrough());

export const connectionFlowTelemetryBodySchema = z.preprocess((raw) => {
  if (!isRecord(raw)) return raw;
  const event =
    typeof raw.event === 'string'
      ? raw.event
      : typeof raw.event_type === 'string'
        ? raw.event_type
        : undefined;
  return { ...raw, event };
}, z.object({
  event: optionalNonEmptyString,
  peer_count: z.unknown().optional(),
  is_group: z.unknown().optional(),
  is_reconnect: z.unknown().optional(),
  selected_count: z.unknown().optional(),
  candidate_count: z.unknown().optional(),
  reason: z.unknown().optional(),
}).passthrough());

export const insightsBeaconCreateBodySchema = z.object({
  venue_id: optionalNonEmptyString,
  perk_description: z.unknown().optional(),
  category_target: z.unknown().optional(),
  duration_minutes: z.unknown().optional(),
}).passthrough();

export const insightsVenueBeaconBodySchema = z.object({
  spotify_playlist_uri: optionalNonEmptyString,
}).passthrough();

export const ghostModeBodySchema = z.object({
  enabled: z.boolean(),
});
