import { createHash, randomBytes, randomUUID } from 'crypto';
import { mintTicketToken } from '@/lib/events/eventPass';

/**
 * Ticket admission credentials.
 *
 * A ticket's QR is a version-2 Click Pass token (`lib/events/eventPass.ts`) derived from its id,
 * so it is stable across devices and never rotates. Only the token's SHA-256 hex hash is stored
 * (`tickets.qr_token_hash`); the scan looks the ticket up by that hash.
 */

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

export type MintedTicketRow = { id: string; ticket_number: string; token_hash: string };

/** A new ticket's id, number and credential hash, ready for `tickets` insert via the RPCs. */
export function mintTicketRow(key: Buffer, beaconId: string): MintedTicketRow {
  const id = randomUUID();
  return {
    id,
    ticket_number: mintTicketNumber(),
    token_hash: hashTicketToken(mintTicketToken(key, beaconId, id)),
  };
}
