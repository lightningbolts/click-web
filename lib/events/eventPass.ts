import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Click Pass — the admission credential an attendee shows at the door (QR in the app and in
 * Apple Wallet).
 *
 * A pass is stateless: `HMAC(key, beacon:user)` binds one attendee to one event, so it works
 * offline in Wallet and needs no table. It is *not* the admission decision — the host's scan
 * re-checks the live RSVP every time, so cancelling an RSVP voids the pass, and a pass that is
 * shared shows the real holder's face and "already checked in" on the second scan.
 *
 * The QR encodes the event's public URL with the pass attached
 * (`https://joinclick.co/e/{beacon}?pass=1.{user}.{sig}`), so any other camera lands on the
 * event page instead of a dead string.
 */

const VERSION = '1';
/** 128-bit truncated HMAC: unforgeable, and keeps the QR sparse enough to scan off a dim screen. */
const SIG_BYTES = 16;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function signature(key: Buffer, beaconId: string, userId: string): Buffer {
  return createHmac('sha256', key)
    .update(`click-pass:v${VERSION}:${beaconId.toLowerCase()}:${userId.toLowerCase()}`)
    .digest()
    .subarray(0, SIG_BYTES);
}

export function mintEventPassToken(key: Buffer, beaconId: string, userId: string): string {
  return [
    VERSION,
    uuidToBytes(userId).toString('base64url'),
    signature(key, beaconId, userId).toString('base64url'),
  ].join('.');
}

export function eventPassUrl(baseUrl: string, beaconId: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/e/${beaconId}?pass=${token}`;
}

/**
 * Short, human-readable pass code ("K7P-4QX"), shown under the QR and in Wallet so a host can
 * tell passes apart at a glance. Derived from the signature; never accepted as a credential.
 */
export function eventPassCode(token: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const sig = Buffer.from(token.split('.')[2] ?? '', 'base64url');
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[(sig[i] ?? 0) % alphabet.length];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export type ParsedPassCredential =
  | { ok: true; beaconId: string | null; token: string }
  | { ok: false };

/** Accepts the full QR URL (any host) or a bare token. `beaconId` is the URL's event, if any. */
export function parsePassCredential(raw: string): ParsedPassCredential {
  const value = raw.trim();
  if (!value) return { ok: false };
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const token = url.searchParams.get('pass');
      const match = url.pathname.match(/\/e\/([0-9a-f-]{36})\/?$/i);
      if (!token) return { ok: false };
      return { ok: true, beaconId: match?.[1]?.toLowerCase() ?? null, token };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, beaconId: null, token: value };
}

/** The holder's user id when `token` is a valid pass for `beaconId`; otherwise null. */
export function verifyEventPassToken(key: Buffer, beaconId: string, token: string): string | null {
  const [version, userPart, sigPart, ...rest] = token.split('.');
  if (version !== VERSION || !userPart || !sigPart || rest.length > 0) return null;
  const userBytes = Buffer.from(userPart, 'base64url');
  const given = Buffer.from(sigPart, 'base64url');
  if (userBytes.length !== 16 || given.length !== SIG_BYTES) return null;
  const userId = bytesToUuid(userBytes);
  if (!UUID_RE.test(userId) || !UUID_RE.test(beaconId)) return null;
  const expected = signature(key, beaconId, userId);
  return timingSafeEqual(given, expected) ? userId : null;
}
