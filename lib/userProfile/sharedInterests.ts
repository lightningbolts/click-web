/**
 * Compare two interest tag lists (e.g. from `user_interests.tags`) and return
 * shared tags for conversation starters. Matching is case-insensitive; output
 * preserves the first-seen casing from `viewerTags`.
 */
export function getSharedInterestTags(viewerTags: string[], peerTags: string[]): string[] {
  if (!viewerTags.length || !peerTags.length) return [];

  const peerLower = new Map<string, string>();
  for (const t of peerTags) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (!s) continue;
    const k = s.toLowerCase();
    if (!peerLower.has(k)) peerLower.set(k, s);
  }
  if (peerLower.size === 0) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of viewerTags) {
    const s = typeof t === 'string' ? t.trim() : '';
    if (!s) continue;
    const k = s.toLowerCase();
    if (!peerLower.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
