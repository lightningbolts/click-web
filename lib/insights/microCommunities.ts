/**
 * Types for `insights_venue_micro_communities` RPC (verified cliques on-premise).
 */

import type { TribeBubble } from '@/lib/insights/mockData';

export type VenueMicroCommunityTag = {
  tag: string;
  count: number;
};

export type VenueMicroCommunity = {
  kind: 'micro_community';
  verifiedPairwiseClique: true;
  attendeeCount: number;
  topTags: VenueMicroCommunityTag[];
};

export function parseMicroCommunitiesRpc(value: unknown): VenueMicroCommunity[] {
  if (!Array.isArray(value)) return [];
  const out: VenueMicroCommunity[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    if (o.kind !== 'micro_community') continue;
    const attendeeCount = typeof o.attendeeCount === 'number' ? o.attendeeCount : 0;
    const rawTags = o.topTags;
    const topTags: VenueMicroCommunityTag[] = [];
    if (Array.isArray(rawTags)) {
      for (const t of rawTags) {
        if (!t || typeof t !== 'object') continue;
        const tr = t as Record<string, unknown>;
        const tag = typeof tr.tag === 'string' ? tr.tag : '';
        const count = typeof tr.count === 'number' ? tr.count : 0;
        if (tag.trim()) topTags.push({ tag: tag.trim(), count });
      }
    }
    out.push({
      kind: 'micro_community',
      verifiedPairwiseClique: true,
      attendeeCount,
      topTags,
    });
  }
  return out;
}

const MC_COLORS = ['#06D6A0', '#C77DFF', '#3A86FF', '#FF6B6B', '#FFD93D', '#00F5D4', '#8338EC'];

/**
 * Map API micro-communities to [TribeBubble] positions for TribeChart (deterministic layout).
 */
export function microCommunitiesToTribeBubbles(rows: VenueMicroCommunity[]): TribeBubble[] {
  const n = rows.length;
  if (n === 0) return [];
  return rows.map((row, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 + 0.35;
    const radius = n <= 1 ? 0.32 : 0.38;
    const x = 50 + Math.cos(angle) * radius * 45;
    const y = 50 + Math.sin(angle) * radius * 38;
    const size = Math.max(8, Math.min(72, row.attendeeCount * 10));
    return {
      id: `mc-${i}`,
      name: `Micro-Community ${i + 1}`,
      size,
      x,
      y,
      color: MC_COLORS[i % MC_COLORS.length],
      connections: row.attendeeCount,
      isMicroCommunity: true,
      interestTags: row.topTags,
    };
  });
}
