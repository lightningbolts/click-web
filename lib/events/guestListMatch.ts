import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedGuestEntry } from '@/lib/events/guestListParse';

export type MatchConfidence = 'exact_email' | 'none';

export type MatchedGuestEntry = ParsedGuestEntry & {
  matched_user_id: string | null;
  match_confidence: MatchConfidence;
};

export function applyHashMatches(
  entries: ParsedGuestEntry[],
  hashToUserId: Map<string, string>,
): MatchedGuestEntry[] {
  return entries.map((entry) => {
    const matched = entry.email_hash ? hashToUserId.get(entry.email_hash) ?? null : null;
    return {
      ...entry,
      matched_user_id: matched,
      match_confidence: matched ? 'exact_email' : 'none',
    };
  });
}

export async function loadEmailHashMatches(
  admin: SupabaseClient,
  hashes: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(hashes.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;

  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('user_contact_hashes')
      .select('hash, user_id')
      .in('hash', chunk)
      .eq('kind', 'email');
    if (error) {
      throw new Error(`guest-list match: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (typeof row.hash === 'string' && typeof row.user_id === 'string' && row.user_id.trim()) {
        out.set(row.hash, row.user_id.trim());
      }
    }
  }
  return out;
}

export async function matchGuestEntries(
  admin: SupabaseClient,
  entries: ParsedGuestEntry[],
): Promise<MatchedGuestEntry[]> {
  const hashes = entries.map((e) => e.email_hash).filter((h): h is string => !!h);
  const map = await loadEmailHashMatches(admin, hashes);
  return applyHashMatches(entries, map);
}
