import { inboxPeerIds } from '@/lib/clicks/inboxPreload';

const row = (id: string, userIds: string[]) => ({ id, user_ids: userIds });

describe('inboxPeerIds', () => {
  it('lists the other people across active, archived and map-only rows once', () => {
    const ids = inboxPeerIds(
      {
        active: [row('c1', ['me', 'a']), row('c2', ['me', 'b'])],
        archived: [row('c3', ['me', 'a', 'c'])],
        map: [row('c1', ['me', 'a']), row('c4', ['me', 'd'])],
        core: [],
      },
      'me',
    );
    expect(ids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is empty when the inbox is empty, even with map rows', () => {
    expect(inboxPeerIds({ active: [], archived: [], map: [row('c4', ['me', 'd'])], core: [] }, 'me')).toEqual([]);
  });
});
