/**
 * Privacy-preserving contact matching (iOS `ContactDiscoveryService` parity): contacts are
 * normalized and SHA-256 hashed on the device; only hashes reach `/api/contacts/discover`.
 */

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length >= 3 && trimmed.includes('@') ? trimmed : null;
}

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/** One free-text entry: an email if it has an @, otherwise a phone number. */
export function normalizeContact(raw: string): string | null {
  return raw.includes('@') ? normalizeEmail(raw) : normalizePhoneE164(raw);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalizes, dedupes and hashes entries; unusable ones are dropped. */
export async function hashContacts(entries: readonly string[], max = 1000): Promise<string[]> {
  const normalized = new Set<string>();
  for (const e of entries) {
    const n = normalizeContact(e);
    if (n) normalized.add(n);
  }
  return Promise.all([...normalized].slice(0, max).map(sha256Hex));
}
