/**
 * Stable React keys for string arrays that may contain duplicates.
 * Keys are derived from content + per-value occurrence tallies (not React array indices).
 */
export function stableKeysForStringList(items: string[], namespace: string): string[] {
  const tallies = new Map<string, number>();
  return items.map((s) => {
    const n = (tallies.get(s) ?? 0) + 1;
    tallies.set(s, n);
    return `${namespace}\u001d${s}\u001d${n}`;
  });
}
