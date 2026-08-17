/**
 * Window around a target message for timeline deep-links.
 * Older page is newest-first (matches GET /api/chat/messages); newer is oldest-first.
 */
export function mergeAroundTargetMessages<T extends { id: string }>(
  olderOrEqual: T[],
  newer: T[],
  target: T | null,
): T[] {
  const byId = new Map<string, T>();
  for (const row of [...olderOrEqual, ...newer, ...(target ? [target] : [])]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}
