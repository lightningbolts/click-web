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

export type StripConfig = { teaser: 'pixelated' | 'none'; stripDays: number; stripLimit: number };

export type StripCandidate = { id: string; userId: string; createdAtMs: number; revealAtMs: number };

/**
 * The bounded Home strip: recent drops only (never an infinite feed), newest first. Before reveal a
 * drop shows as a teaser only when teasers are on — except your own, which you always see.
 */
export function selectStrip<T extends StripCandidate>(drops: T[], viewerId: string, nowMs: number, config: StripConfig): T[] {
  const since = nowMs - config.stripDays * 86_400_000;
  return drops
    .filter((d) => d.createdAtMs > since)
    .filter((d) => d.userId === viewerId || d.revealAtMs <= nowMs || config.teaser === 'pixelated')
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, config.stripLimit);
}
