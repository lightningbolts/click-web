import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { publicOrigin } from '@/lib/events/eventUrls';
import { runtimeEnv } from '@/lib/server/runtimeEnv';

/**
 * Email-approved chat history for a user's newer E2EE v2 devices.
 *
 * Registering an additional device creates a pending `chat_device_history_requests` row and
 * emails the account a Supabase magic link that lands on `/devices/approve/<id>`. Approving from
 * that emailed session lets the user's older devices upload wrapped historical epoch keys
 * (enforced in `approve_chat_key_transfer`). Epoch keys never reach the server.
 */

/** How recently the approving session must have been created from the emailed link. */
export const EMAIL_PROOF_MAX_AGE_SECONDS = 15 * 60;

export function deviceApprovalPath(requestId: string): string {
  return `/devices/approve/${requestId}`;
}

/**
 * True when [bearer] (already signature-verified by `requireBearerUser`) comes from a session that
 * was created by an emailed one-time link within [maxAgeSeconds] — i.e. the caller proved access
 * to the account's inbox, not just its password.
 */
export function sessionProvesEmailAccess(
  bearer: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = EMAIL_PROOF_MAX_AGE_SECONDS,
): boolean {
  let amr: unknown;
  try {
    const payload = bearer.split('.')[1] ?? '';
    amr = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { amr?: unknown }).amr;
  } catch {
    return false;
  }
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method !== 'otp' && method !== 'magiclink') return false;
    return typeof timestamp === 'number' && nowSeconds - timestamp <= maxAgeSeconds && timestamp <= nowSeconds + 60;
  });
}

type SendMagicLink = (email: string, redirectTo: string) => Promise<{ error: { message: string } | null }>;

/** Sends Supabase's magic-link email (implicit flow, so the session arrives in the URL fragment). */
export const sendApprovalMagicLink: SendMagicLink = async (email, redirectTo) => {
  const url = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = runtimeEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return { error: { message: 'Supabase URL or anon key is not configured' } };
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' },
  });
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  return { error: error ? { message: error.message } : null };
};

/**
 * Called when [device] registers for [user] (first time, or again for devices registered before
 * this feature). When the user has an older active device, records a pending history request and
 * emails the approval link once per device. The account's oldest device has no history to receive.
 */
export async function requestHistoryApprovalForNewDevice(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
  device: { id: string; created_at: string },
  send: SendMagicLink = sendApprovalMagicLink,
): Promise<'requested' | 'first-device' | 'no-email' | 'exists'> {
  const deviceRowId = device.id;
  // Only a device with an OLDER active sibling has history to receive.
  const { data: others, error: othersError } = await admin
    .from('chat_devices')
    .select('id')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .neq('id', deviceRowId)
    .lt('created_at', device.created_at)
    .limit(1);
  if (othersError) throw new Error(`device lookup failed: ${othersError.message}`);
  if (!others || others.length === 0) return 'first-device';

  const email = user.email?.trim();
  if (!email) return 'no-email';

  const { data: request, error: insertError } = await admin
    .from('chat_device_history_requests')
    .insert({ user_id: user.id, recipient_device_id: deviceRowId })
    .select('id')
    .single();
  if (insertError) {
    if (insertError.code === '23505') return 'exists';
    throw new Error(`history request insert failed: ${insertError.message}`);
  }

  const redirectTo = `${publicOrigin()}${deviceApprovalPath(request.id as string)}`;
  const { error: sendError } = await send(email, redirectTo);
  if (sendError) throw new Error(`approval email failed: ${sendError.message}`);
  return 'requested';
}

export type BackfillRow = {
  request_id: string;
  recipient_device_id: string;
  recipient_public_key: string;
  chat_id: string;
  epoch: number;
};

export type HistoryBackfillItem = {
  request_id: string;
  recipient_device_id: string;
  recipient_public_key: string;
  chat_id: string;
  epochs: number[];
};

/** Groups flat RPC rows into one item per (recipient device, chat). */
export function groupBackfillRows(rows: BackfillRow[]): HistoryBackfillItem[] {
  const byKey = new Map<string, HistoryBackfillItem>();
  for (const row of rows) {
    const key = `${row.recipient_device_id}|${row.chat_id}`;
    const item = byKey.get(key) ?? {
      request_id: row.request_id,
      recipient_device_id: row.recipient_device_id,
      recipient_public_key: row.recipient_public_key,
      chat_id: row.chat_id,
      epochs: [],
    };
    if (!item.epochs.includes(row.epoch)) item.epochs.push(row.epoch);
    byKey.set(key, item);
  }
  return [...byKey.values()].map((item) => ({ ...item, epochs: item.epochs.sort((a, b) => a - b) }));
}
