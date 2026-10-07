import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

/** `GET /api/beacons/{id}/pass` (spec 06 §1). */
export type ClickPass = {
  credential_url: string;
  code: string;
  checked_in_at: string | null;
  wallet_available: boolean;
};

/**
 * What the pass screen shows: the pass, "RSVP first" (403 `not_going`), or "not available right
 * now" (503 `pass_unavailable`: the server can't sign passes; the RSVP still counts).
 */
export type ClickPassState = { kind: 'ready'; pass: ClickPass } | { kind: 'not_going' } | { kind: 'unavailable' };

export function clickPassUrl(beaconId: string): string {
  return `/api/beacons/${beaconId}/pass`;
}

/** Throws on network and server errors, so SWR keeps the last pass on screen. */
export async function fetchClickPass(url: string): Promise<ClickPassState> {
  const res = await fetch(url, { headers: await getFreshAuthHeaders(), credentials: 'include', cache: 'no-store' });
  if (res.status === 403) return { kind: 'not_going' };
  if (res.status === 503) return { kind: 'unavailable' };
  if (!res.ok) throw new Error(`pass ${res.status}`);
  return { kind: 'ready', pass: (await res.json()) as ClickPass };
}

/** The event is on, or starts within the hour: the host may scan at any moment. */
export function isAtTheDoor(startMs: number | null, endMs: number | null, nowMs: number): boolean {
  if (startMs == null) return false;
  return startMs - nowMs < 3_600_000 && (endMs == null || endMs > nowMs);
}

/**
 * Wallet passes open in Safari on iPhone, iPad and Mac (spec 06 §1). Other browsers there
 * download the file instead, so they don't get the button.
 */
export function isAppleSafari(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) && /Safari\//.test(userAgent) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|EdgA?\/|OPR\/|OPiOS|Android/.test(userAgent);
}
