import { dropDevelopState } from '@/lib/drops/developState';
import type { HomeDrop } from '@/lib/home/types';

/**
 * One person's shared drops on the Home strip, Instagram-style (iOS `SharedDropGroup`): a single
 * tile that opens the story on their drops, oldest first, then carries on to the next person.
 */
export type SharedDropGroup = {
  userId: string;
  isMine: boolean;
  /** Oldest first: the order the story plays them. */
  drops: HomeDrop[];
  /** The drops that can be opened (not still pending), in play order. */
  viewable: HomeDrop[];
  /** Where the story starts: the first drop still to develop, else the first one. */
  start: HomeDrop | null;
  /** The tile's face: the drop the story opens on (the newest, a countdown, while none can open). */
  cover: HomeDrop;
  /** Has a drop that's ready and not yet developed (the tile's ready ring). */
  hasUnwatched: boolean;
};

/** The full photo once this viewer has developed it; the pixelated preview stands in until then. */
export function dropPhotoUrl(drop: HomeDrop): string | null {
  return drop.developed_at ? drop.original_url : null;
}

export function dropState(drop: HomeDrop, nowMs: number) {
  return dropDevelopState(Date.parse(drop.reveal_at), drop.developed_at, nowMs);
}

/**
 * Groups the strip (newest first) by person: yours first, then people with drops you haven't
 * watched, then everyone else, each by their newest drop.
 */
export function groupSharedDrops(list: readonly HomeDrop[], nowMs: number): SharedDropGroup[] {
  const byUser = new Map<string, HomeDrop[]>();
  for (const drop of list) byUser.set(drop.user.id, [...(byUser.get(drop.user.id) ?? []), drop]);
  const groups = [...byUser].map(([userId, newestFirst]): SharedDropGroup => {
    const drops = [...newestFirst].reverse();
    const viewable = drops.filter((d) => dropState(d, nowMs) !== 'pending');
    const start = viewable.find((d) => dropState(d, nowMs) === 'ready') ?? viewable[0] ?? null;
    return {
      userId,
      isMine: drops[0].is_mine,
      drops,
      viewable,
      start,
      cover: start ?? drops[drops.length - 1],
      hasUnwatched: drops.some((d) => dropState(d, nowMs) === 'ready'),
    };
  });
  const others = groups.filter((g) => !g.isMine);
  return [...groups.filter((g) => g.isMine), ...others.filter((g) => g.hasUnwatched), ...others.filter((g) => !g.hasUnwatched)];
}
