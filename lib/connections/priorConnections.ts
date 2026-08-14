import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runtimeEnv } from '@/lib/server/runtimeEnv';
import {
  HANDSHAKE_CONNECTION_SOURCE,
  PRIOR_CONNECTION_SOURCE,
  type ConnectionSource,
} from '@/lib/insights/analytics';

export { HANDSHAKE_CONNECTION_SOURCE, PRIOR_CONNECTION_SOURCE };
export type { ConnectionSource };

export const KNOWN_SINCE_BUCKETS = [
  'childhood',
  'high_school',
  'college',
  'this_year',
  'unspecified',
] as const;

export type KnownSinceBucket = (typeof KNOWN_SINCE_BUCKETS)[number];

export const KNOWN_SINCE_LABELS: Record<KnownSinceBucket, string> = {
  childhood: 'Childhood',
  high_school: 'High School',
  college: 'College',
  this_year: 'This Year',
  unspecified: 'Unspecified',
};

export const PRIOR_CONNECTION_BADGE_LABEL = 'Prior Connection · Self-Reported';
export const PRIOR_REQUESTS_PER_DAY = 20;
export const PRIOR_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_DISCOVER_HASHES = 1000;
export const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

export function isKnownSinceBucket(value: unknown): value is KnownSinceBucket {
  return typeof value === 'string' && (KNOWN_SINCE_BUCKETS as readonly string[]).includes(value);
}

export function knownSinceLabel(bucket: unknown): string {
  if (isKnownSinceBucket(bucket)) return KNOWN_SINCE_LABELS[bucket];
  return KNOWN_SINCE_LABELS.unspecified;
}

/** SHA-256 hex of UTF-8 bytes — must match KMP `ContactDiscoveryHelper.hashUtf8`. */
export function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 3 || !trimmed.includes('@')) return null;
  return trimmed;
}

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export function sortedUserIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function pairIncludes(userIds: unknown, userId: string): boolean {
  if (!Array.isArray(userIds)) return false;
  return userIds.some((id) => typeof id === 'string' && id.trim() === userId);
}

export function sameMemberSet(userIds: unknown, a: string, b: string): boolean {
  return pairIncludes(userIds, a) && pairIncludes(userIds, b);
}

export async function isPairBlocked(
  admin: SupabaseClient,
  userId: string,
  peerId: string,
): Promise<boolean> {
  const { data: a, error: errA } = await admin
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', userId)
    .eq('blocked_id', peerId)
    .maybeSingle();
  if (errA) return true;
  if (a) return true;
  const { data: b, error: errB } = await admin
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', peerId)
    .eq('blocked_id', userId)
    .maybeSingle();
  if (errB) return true;
  return Boolean(b);
}

function priorPushUrl(): string | null {
  const base = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  return base ? `${base}/functions/v1/send-push-notification` : null;
}

/**
 * Notify the target that someone claims a prior connection. Failures are logged,
 * never thrown — request insert success is independent of APNs/FCM.
 */
export async function notifyPriorConnectionRequest(args: {
  recipientUserId: string;
  senderUserId: string;
  senderName: string;
  connectionId: string;
}): Promise<void> {
  const pushUrl = priorPushUrl();
  const serviceKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!pushUrl || !serviceKey) return;
  try {
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_user_id: args.recipientUserId,
        title: 'Prior connection request',
        body: `${args.senderName} says they already know you`,
        data: {
          type: 'prior_connection_request',
          connection_id: args.connectionId,
          sender_user_id: args.senderUserId,
        },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[prior-connections] push failed', response.status, text);
    }
  } catch (error) {
    console.warn('[prior-connections] push error', error);
  }
}

export function priorInsertRow(args: {
  initiatorId: string;
  responderId: string;
  knownSince: KnownSinceBucket;
  contextTag: string | null;
  nowMs: number;
}): Record<string, unknown> {
  const createdUtc = new Date(args.nowMs).toISOString();
  const hh = String(new Date(args.nowMs).getUTCHours()).padStart(2, '0');
  const mm = String(new Date(args.nowMs).getUTCMinutes()).padStart(2, '0');
  const ss = String(new Date(args.nowMs).getUTCSeconds()).padStart(2, '0');
  return {
    user_ids: sortedUserIds(args.initiatorId, args.responderId),
    created: args.nowMs,
    created_utc: createdUtc,
    time_of_day_utc: `${hh}:${mm}:${ss} UTC`,
    expiry: args.nowMs + 30 * 24 * 60 * 60 * 1000,
    should_continue: [false, false],
    has_begun: false,
    status: 'pending',
    expiry_state: 'pending',
    initiator_id: args.initiatorId,
    responder_id: args.responderId,
    connection_method: 'prior',
    proximity_confidence: 0,
    flagged: false,
    include_in_business_insights: false,
    source: PRIOR_CONNECTION_SOURCE,
    confirmed_by_a: true,
    confirmed_by_b: false,
    known_since: args.knownSince,
    context_tag: args.contextTag,
    is_group: false,
  };
}

export function isPriorTarget(row: {
  initiator_id?: string | null;
  responder_id?: string | null;
  user_ids?: unknown;
}, callerId: string): boolean {
  const responder = typeof row.responder_id === 'string' ? row.responder_id.trim() : '';
  if (responder) return responder === callerId;
  const initiator = typeof row.initiator_id === 'string' ? row.initiator_id.trim() : '';
  if (initiator && initiator === callerId) return false;
  return pairIncludes(row.user_ids, callerId);
}
