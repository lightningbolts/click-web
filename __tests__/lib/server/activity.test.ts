/**
 * @jest-environment node
 */

jest.mock('server-only', () => ({}));

import { FakeDb } from '@/__tests__/helpers/fakeSupabase';
import {
  loadActivity,
  markActivitySeen,
  recordActivity,
  recordReactionActivity,
  recordRsvpActivity,
  withOthers,
} from '@/lib/server/activity';
import type { SupabaseClient } from '@supabase/supabase-js';

const client = (db: FakeDb) => db.client as unknown as SupabaseClient;
const users = [
  { id: 'maya', name: 'Maya Chen', first_name: 'Maya', last_name: 'Chen', image: 'https://img/maya.jpg' },
  { id: 'sam', name: 'Sam', first_name: null, last_name: null, image: null },
];

describe('withOthers', () => {
  it('names one person, then counts the rest', () => {
    expect(withOthers('Maya', 1)).toBe('Maya');
    expect(withOthers('Maya', 2)).toBe('Maya and 1 other');
    expect(withOthers('Maya', 4)).toBe('Maya and 3 others');
  });
});

describe('recordActivity', () => {
  it('calls record_activity and never records your own action', async () => {
    const db = new FakeDb();
    await recordActivity(client(db), { userId: 'me', type: 'wave', title: 'Hi', data: { type: 'wave' }, actorId: 'me' });
    expect(db.log.filter((l) => l.op === 'rpc')).toHaveLength(0);
    await recordActivity(client(db), { userId: 'me', type: 'wave', title: 'Hi', data: { type: 'wave' }, actorId: 'maya' });
    expect(db.log.find((l) => l.op === 'rpc')?.payload).toEqual({
      p_user_id: 'me', p_type: 'wave', p_title: 'Hi', p_body: '', p_data: { type: 'wave' }, p_actor_id: 'maya', p_group_key: null,
    });
  });

  it('swallows write errors', async () => {
    const db = new FakeDb({ rpc: { record_activity: () => { throw new Error('missing'); } } });
    await expect(recordActivity(client(db), { userId: 'me', type: 'x', title: 'x', data: {} })).resolves.toBeUndefined();
  });
});

describe('recordReactionActivity', () => {
  it('names the reactor and emoji, then rolls later reactions into one row', async () => {
    const db = new FakeDb({ tables: { users, reactions: [{ target_kind: 'shared_drop', target_id: 'd1', user_id: 'maya' }] } });
    await recordReactionActivity(client(db), { kind: 'shared_drop', targetId: 'd1', ownerId: 'me', actorId: 'maya', emoji: '🔥' });
    db.rows('reactions').push({ target_kind: 'shared_drop', target_id: 'd1', user_id: 'sam' });
    await recordReactionActivity(client(db), { kind: 'shared_drop', targetId: 'd1', ownerId: 'me', actorId: 'sam', emoji: '❤️' });
    const calls = db.log.filter((l) => l.op === 'rpc').map((l) => l.payload as Record<string, unknown>);
    expect(calls[0]).toMatchObject({ p_user_id: 'me', p_title: 'Maya reacted 🔥 to your drop', p_group_key: 'reaction:shared_drop:d1', p_actor_id: 'maya' });
    expect(calls[0].p_data).toEqual({ type: 'reaction', target_kind: 'shared_drop', target_id: 'd1', drop_id: 'd1' });
    expect(calls[1]).toMatchObject({ p_title: 'Sam and 1 other reacted to your drop', p_group_key: 'reaction:shared_drop:d1' });
  });
});

describe('recordRsvpActivity', () => {
  it('tells the host who is going, per event', async () => {
    const db = new FakeDb({
      tables: { users, beacon_attendees: [{ beacon_id: 'e1', user_id: 'maya' }, { beacon_id: 'e1', user_id: 'host' }] },
    });
    await recordRsvpActivity(client(db), { beaconId: 'e1', hostId: 'host', actorId: 'maya', metadata: { title: 'Rooftop Jazz' }, requested: false });
    expect(db.log.find((l) => l.op === 'rpc')?.payload).toMatchObject({
      p_user_id: 'host', p_type: 'event_rsvp', p_title: 'Maya is going', p_body: 'Rooftop Jazz',
      p_data: { type: 'event_rsvp', beacon_id: 'e1' }, p_group_key: 'rsvp:e1',
    });
  });

  it('counts pending join requests', async () => {
    const db = new FakeDb({
      tables: { users, event_rsvp_requests: [{ beacon_id: 'e1', user_id: 'maya', status: 'pending' }, { beacon_id: 'e1', user_id: 'sam', status: 'pending' }] },
    });
    await recordRsvpActivity(client(db), { beaconId: 'e1', hostId: 'host', actorId: 'sam', metadata: { title: 'Jazz' }, requested: true });
    expect(db.log.find((l) => l.op === 'rpc')?.payload).toMatchObject({
      p_type: 'event_rsvp_request', p_title: 'Sam and 1 other want to join', p_group_key: 'rsvp_request:e1',
    });
  });
});

describe('loadActivity', () => {
  const item = (id: string, at: string, actor: string | null) => ({
    id, user_id: 'me', type: 'wave', title: id, body: '', data: { type: 'wave', n: 1 }, actor_id: actor, created_at: at,
  });

  it('returns newest first with actors inline, hiding blocked people, and pages from the last row read', async () => {
    const db = new FakeDb({
      tables: {
        users,
        activity_items: [
          item('a', '2026-10-01T00:00:00Z', 'maya'),
          item('b', '2026-10-03T00:00:00Z', 'sam'),
          item('c', '2026-10-02T00:00:00Z', null),
          { ...item('other', '2026-10-04T00:00:00Z', null), user_id: 'someone-else' },
        ],
        activity_seen: [{ user_id: 'me', seen_at: '2026-10-02T00:00:00Z' }],
        user_blocks: [{ blocker_id: 'sam', blocked_id: 'me' }],
      },
    });
    const page = await loadActivity(client(db), 'me', { limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(['c']);
    expect(page.items[0].data).toEqual({ type: 'wave', n: '1' });
    expect(page.seen_at).toBe('2026-10-02T00:00:00Z');
    expect(page.next_before).toBe('2026-10-02T00:00:00Z');

    const next = await loadActivity(client(db), 'me', { limit: 2, before: page.next_before });
    expect(next.items).toEqual([
      expect.objectContaining({ id: 'a', actor: { id: 'maya', name: 'Maya Chen', avatar_url: 'https://img/maya.jpg' } }),
    ]);
    expect(next.next_before).toBeNull();
  });
});

describe('markActivitySeen', () => {
  it('only moves forward and never past now', async () => {
    const db = new FakeDb({ tables: { activity_seen: [{ user_id: 'me', seen_at: '2026-10-02T00:00:00.000Z' }] } });
    await markActivitySeen(client(db), 'me', '2026-10-01T00:00:00Z');
    expect(db.rows('activity_seen')[0].seen_at).toBe('2026-10-02T00:00:00.000Z');
    await markActivitySeen(client(db), 'me', '2999-01-01T00:00:00Z');
    expect(Date.parse(String(db.rows('activity_seen')[0].seen_at))).toBeLessThanOrEqual(Date.now());
  });
});
