import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';

function activeIntents(rows: AvailabilityIntentRow[], nowMs: number): AvailabilityIntentRow[] {
  return rows.filter((r) => {
    const t = Date.parse(r.expires_at);
    return !Number.isNaN(t) && t > nowMs;
  });
}

/**
 * Returns a display label when the signed-in user and a peer both have active intents
 * sharing a tag or timeframe (mirrors mobile `AvailabilityIntentOverlap.kt`).
 */
export function computeIntentOverlapLabel(
  self: AvailabilityIntentRow[],
  peer: AvailabilityIntentRow[],
  nowMs = Date.now(),
): string | null {
  const a = activeIntents(self, nowMs);
  const b = activeIntents(peer, nowMs);
  if (!a.length || !b.length) return null;

  const tagsB = new Set(b.map((x) => x.intent_tag.trim().toLowerCase()).filter(Boolean));
  for (const row of a) {
    const tag = row.intent_tag.trim();
    if (tag && tagsB.has(tag.toLowerCase())) {
      return tag;
    }
  }

  const tfA = new Set(a.map((x) => x.timeframe.trim().toLowerCase()).filter(Boolean));
  for (const row of b) {
    const tf = row.timeframe.trim().toLowerCase();
    if (tf && tfA.has(tf)) {
      return row.intent_tag.trim() || row.timeframe.trim() || 'Vibes match';
    }
  }
  return null;
}

export function hasIntentOverlap(self: AvailabilityIntentRow[], peer: AvailabilityIntentRow[], nowMs = Date.now()): boolean {
  return computeIntentOverlapLabel(self, peer, nowMs) != null;
}
