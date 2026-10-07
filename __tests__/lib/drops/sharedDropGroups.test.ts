import { dropPhotoUrl, groupSharedDrops } from '@/lib/drops/sharedDropGroups';
import type { HomeDrop } from '@/lib/home/types';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const PAST = '2026-10-07T10:00:00Z';
const FUTURE = '2026-10-07T13:00:00Z';

function drop(id: string, userId: string, over: Partial<HomeDrop> = {}): HomeDrop {
  return {
    id,
    user: { id: userId, name: `Person ${userId}`, avatar_url: null },
    is_mine: false,
    connection_id: `c-${userId}`,
    created_at: PAST,
    reveal_at: PAST,
    developed_at: null,
    width: null,
    height: null,
    preview_url: `https://x/${id}-preview.jpg`,
    original_url: null,
    reactions: null,
    caption: null,
    ...over,
  };
}

describe('groupSharedDrops', () => {
  it('makes one chapter per person, oldest first, from a newest-first strip', () => {
    const [group] = groupSharedDrops([drop('b2', 'b'), drop('b1', 'b')], NOW);
    expect(group.drops.map((d) => d.id)).toEqual(['b1', 'b2']);
  });

  it('orders yours first, then people with drops to develop, then everyone else, by newest drop', () => {
    const groups = groupSharedDrops(
      [
        drop('watched', 'w', { developed_at: PAST }),
        drop('ready', 'r'),
        drop('mine', 'me', { is_mine: true, developed_at: PAST }),
        drop('watched2', 'w2', { developed_at: PAST }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.userId)).toEqual(['me', 'r', 'w', 'w2']);
  });

  it('starts on the first drop still to develop, else the first one, and skips pending drops', () => {
    const [group] = groupSharedDrops(
      [drop('pending', 'a', { reveal_at: FUTURE }), drop('ready', 'a'), drop('seen', 'a', { developed_at: PAST })],
      NOW,
    );
    expect(group.viewable.map((d) => d.id)).toEqual(['seen', 'ready']);
    expect(group.start?.id).toBe('ready');
    expect(group.cover.id).toBe('ready');
    expect(group.hasUnwatched).toBe(true);
  });

  it('shows the newest drop as a countdown while none can open', () => {
    const [group] = groupSharedDrops([drop('new', 'a', { reveal_at: FUTURE }), drop('old', 'a', { reveal_at: FUTURE })], NOW);
    expect(group.start).toBeNull();
    expect(group.cover.id).toBe('new');
    expect(group.hasUnwatched).toBe(false);
  });
});

describe('dropPhotoUrl', () => {
  it('is the original only once this viewer has developed the drop', () => {
    expect(dropPhotoUrl(drop('a', 'a', { original_url: 'o' }))).toBeNull();
    expect(dropPhotoUrl(drop('a', 'a', { original_url: 'o', developed_at: PAST }))).toBe('o');
  });
});
