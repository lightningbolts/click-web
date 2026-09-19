import { createHash, randomBytes } from 'crypto';

/**
 * Ticket admission credentials.
 *
 * The QR payload is an opaque token with 256 bits of entropy; only its
 * SHA-256 hex hash is stored (`tickets.qr_token_hash`), so a leaked database
 * cannot be turned into printable admission credentials. The plaintext token
 * is returned only to the authenticated ticket owner, by rotating the
 * credential (mint new token, overwrite the stored hash) on request.
 */

const TOKEN_BYTES = 32;

export type MintedCredential = {
  /** Opaque base64url token embedded in the QR payload. */
  token: string;
  /** Hex SHA-256 of the token; the only value persisted. */
  tokenHash: string;
};

export function mintTicketCredential(): MintedCredential {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashTicketToken(token) };
}

export function hashTicketToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Human-facing ticket number: no PII, no sequence, collision-checked by a unique index. */
export function mintTicketNumber(): string {
  // 10 chars from an unambiguous alphabet (no 0/O/1/I) ≈ 50 bits.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let out = 'CLK-';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 4) out += '-';
  }
  return out;
}

/** HTTPS QR payload; a non-Click scanner lands on a controlled fallback page. */
export function ticketQrUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/t/${token}`;
}
