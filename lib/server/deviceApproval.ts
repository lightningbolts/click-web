import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { importPublicKeySpkiBase64, wrapEpochKey } from '@/lib/chat/e2eeV2';
import { sendPush } from '@/lib/nudges/moments';
import { cronPushBearer, pushFunctionUrl } from '@/lib/server/cronAuth';
import { deviceApprovalPath, sendApprovalMagicLink } from '@/lib/server/deviceHistory';
import { publicOrigin } from '@/lib/events/eventUrls';
import { newSignInSubject } from '@/lib/chat/deviceLabel';

/**
 * Approving a new device from a device already on the account (the primary path; the emailed
 * magic link is the fallback). The approving device proves it holds its identity key: the server
 * wraps a random challenge to that key in the same envelope as an epoch key, and the device sends
 * the challenge back. Only a hash is stored; each challenge works once, for five minutes.
 */

/** Wrap metadata for a challenge (the envelope binds to the request and the approving device). */
export const APPROVAL_SENDER_DEVICE_ID = 'click-device-approval';
export const APPROVAL_EPOCH = 1;
export function approvalChatId(requestId: string): string {
  return `approval:${requestId}`;
}

/** How long a deferred request waits for a device before the email goes out. */
export const EMAIL_FALLBACK_DELAY_MS = 3 * 60 * 1000;

type DeviceRow = { id: string; user_id: string; device_id: string; identity_public_key: string; created_at: string; revoked_at: string | null };

function hashNonce(nonce: Uint8Array): string {
  return createHash('sha256').update(nonce).digest('hex');
}

/** The caller's own active device by its public device id, or null. */
export async function loadOwnDevice(admin: SupabaseClient, userId: string, deviceId: string): Promise<DeviceRow | null> {
  const { data, error } = await admin
    .from('chat_devices')
    .select('id, user_id, device_id, identity_public_key, created_at, revoked_at')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .eq('key_algorithm', 'X25519')
    .eq('crypto_version', 2)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw new Error(`approval device lookup: ${error.message}`);
  return (data as DeviceRow | null) ?? null;
}

/**
 * A fresh challenge for [approver] to decide [requestId]. Null when the approver isn't one of the
 * caller's active devices, or is the device the request is for.
 */
export async function createApprovalChallenge(
  admin: SupabaseClient,
  args: { userId: string; requestId: string; recipientDeviceRowId: string; approvingDeviceId: string },
): Promise<{ challengeId: string; envelope: string } | null> {
  const approver = await loadOwnDevice(admin, args.userId, args.approvingDeviceId);
  if (!approver || approver.id === args.recipientDeviceRowId) return null;
  const nonce = new Uint8Array(randomBytes(32));
  const envelope = await wrapEpochKey({
    chatId: approvalChatId(args.requestId),
    epoch: APPROVAL_EPOCH,
    senderDeviceId: APPROVAL_SENDER_DEVICE_ID,
    recipientDeviceId: approver.device_id,
    epochKey: nonce,
    recipientPublicKey: await importPublicKeySpkiBase64(approver.identity_public_key),
  });
  const { data, error } = await admin
    .from('chat_device_approval_challenges')
    .insert({ request_id: args.requestId, approving_device_id: approver.id, nonce_hash: hashNonce(nonce) })
    .select('id')
    .single();
  if (error || !data) throw new Error(`approval challenge insert: ${error?.message ?? 'no row'}`);
  return { challengeId: (data as { id: string }).id, envelope };
}

/**
 * Consumes a challenge: true (and the approving device's row id) only when [proof] is the
 * unwrapped challenge for this request and device, unused and unexpired.
 */
export async function consumeApprovalProof(
  admin: SupabaseClient,
  args: { userId: string; requestId: string; approvingDeviceId: string; challengeId: string; proof: string },
  nowMs: number = Date.now(),
): Promise<string | null> {
  const approver = await loadOwnDevice(admin, args.userId, args.approvingDeviceId);
  if (!approver) return null;
  const { data } = await admin
    .from('chat_device_approval_challenges')
    .select('id, nonce_hash, expires_at, used_at')
    .eq('id', args.challengeId)
    .eq('request_id', args.requestId)
    .eq('approving_device_id', approver.id)
    .maybeSingle();
  const row = data as { id: string; nonce_hash: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || Date.parse(row.expires_at) <= nowMs) return null;
  let proof: Buffer;
  try {
    proof = Buffer.from(args.proof, 'base64');
  } catch {
    return null;
  }
  const expected = Buffer.from(row.nonce_hash, 'hex');
  const actual = Buffer.from(hashNonce(new Uint8Array(proof)), 'hex');
  if (proof.length !== 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  // One use: only the run that flips used_at may decide.
  const { data: used } = await admin
    .from('chat_device_approval_challenges')
    .update({ used_at: new Date(nowMs).toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();
  return used ? approver.id : null;
}

/** "Approve your new sign-in": to every device on the account (the new one shows no prompt). */
export async function notifyDevicesOfNewSignIn(userId: string, requestId: string, label: string | null): Promise<boolean> {
  const url = pushFunctionUrl();
  const bearer = cronPushBearer();
  if (!url || !bearer) return false;
  const what = newSignInSubject(label);
  return sendPush(
    url,
    bearer,
    userId,
    { title: 'New sign-in to Click', body: `${what} signed in to your account. Open Click on a device you already use to approve it.` },
    { type: 'device_approval', request_id: requestId },
  );
}

type SendMagicLink = typeof sendApprovalMagicLink;

/**
 * The fallback: emails the approval link for requests no device has decided within
 * `EMAIL_FALLBACK_DELAY_MS` (accounts whose other devices are on builds without the prompt).
 * Each request is claimed (email_sent_at) before its email, so overlapping runs never send twice.
 */
export async function sendDeferredApprovalEmails(
  admin: SupabaseClient,
  nowMs: number = Date.now(),
  send: SendMagicLink = sendApprovalMagicLink,
): Promise<number> {
  const nowIso = new Date(nowMs).toISOString();
  const { data, error } = await admin
    .from('chat_device_history_requests')
    .select('id, user_id')
    .eq('status', 'pending')
    .eq('email_deferred', true)
    .is('email_sent_at', null)
    .lte('created_at', new Date(nowMs - EMAIL_FALLBACK_DELAY_MS).toISOString())
    .gt('expires_at', nowIso)
    .limit(50);
  if (error) throw new Error(`approval email sweep: ${error.message}`);
  let sent = 0;
  for (const row of (data ?? []) as Array<{ id: string; user_id: string }>) {
    if (await emailApprovalLink(admin, row.id, row.user_id, nowIso, send)) sent += 1;
  }
  return sent;
}

/**
 * Claims and sends one request's approval email (the sweep, or "Email me a link" on the new
 * device). False when it was already sent, or the account has no email.
 */
export async function emailApprovalLink(
  admin: SupabaseClient,
  requestId: string,
  userId: string,
  nowIso: string,
  send: SendMagicLink = sendApprovalMagicLink,
): Promise<boolean> {
  const { data: claimed } = await admin
    .from('chat_device_history_requests')
    .update({ email_sent_at: nowIso })
    .eq('id', requestId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('email_sent_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) return false;
  const { data: user } = await admin.auth.admin.getUserById(userId);
  const email = user?.user?.email?.trim();
  if (!email) return false;
  const { error } = await send(email, `${publicOrigin()}${deviceApprovalPath(requestId)}`);
  if (error) {
    // Let a later run (or the button) try again.
    await admin.from('chat_device_history_requests').update({ email_sent_at: null }).eq('id', requestId);
    console.error('[deviceApproval] email failed:', error.message);
    return false;
  }
  return true;
}
