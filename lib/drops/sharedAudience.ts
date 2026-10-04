/**
 * F3 — who may see a shared drop, from both people's current connection state. Pure: the server
 * gathers the facts, this decides. A viewer sees a poster's drop only when each has the other as
 * an active connection (not hidden or blocked on either side; archived chats still count), and for a core-only drop,
 * only when the poster marked that connection core.
 */

export type SharedAudience = 'all' | 'core';

export type PosterView = {
  /** The poster is among the viewer's active connections (viewer's side). */
  viewerConnected: boolean;
  /** The poster hasn't hidden the connection (poster's side). */
  posterKeepsConnection: boolean;
  /** The poster marked the connection core. */
  posterMarkedCore: boolean;
};

export function canSeeSharedDrop(audience: SharedAudience, view: PosterView | undefined): boolean {
  if (!view?.viewerConnected || !view.posterKeepsConnection) return false;
  return audience === 'all' || view.posterMarkedCore;
}

export type StripConfig = { teaser: 'pixelated' | 'none'; stripWindowHours: number; stripMin: number; stripMax: number };

export type StripCandidate = { id: string; userId: string; createdAtMs: number; revealAtMs: number };

/**
 * Whether a viewer sees this drop at all right now: before reveal a drop shows as a teaser only
 * when teasers are on — except your own, which you always see.
 */
export function isListable(drop: StripCandidate, viewerId: string, nowMs: number, teaser: StripConfig['teaser']): boolean {
  return drop.userId === viewerId || drop.revealAtMs <= nowMs || teaser === 'pixelated';
}

/**
 * The Home strip, newest first: every drop from the last day (`stripWindowHours`) when there are
 * more than `stripMin` of them, otherwise the newest `stripMin` whatever their age. `stripMax`
 * bounds a very busy day. Everything else lives in the archive.
 */
export function selectStrip<T extends StripCandidate>(drops: T[], viewerId: string, nowMs: number, config: StripConfig): T[] {
  const since = nowMs - config.stripWindowHours * 3_600_000;
  const sorted = drops
    .filter((d) => isListable(d, viewerId, nowMs, config.teaser))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const recent = sorted.filter((d) => d.createdAtMs > since).length;
  return sorted.slice(0, Math.min(config.stripMax, Math.max(config.stripMin, recent)));
}
