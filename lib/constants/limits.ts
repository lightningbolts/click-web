/** Aligned with Supabase CHECK constraints (`security_feature_limits` migration). */
export const MESSAGE_BODY_MAX_LENGTH = 1000;

export const INTEREST_TAGS_MAX_COUNT = 5;
export const INTEREST_TAG_MAX_STRING_LENGTH = 25;

/** Trim, cap string length, dedupe case-insensitively, keep at most `INTEREST_TAGS_MAX_COUNT`. */
export function normalizeInterestTagsForSave(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const trimmed = t.trim().slice(0, INTEREST_TAG_MAX_STRING_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= INTEREST_TAGS_MAX_COUNT) break;
  }
  return out;
}
