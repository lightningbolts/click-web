import { homeGreeting, nudgeConnection, savedEventState, selectHomeOpportunity, type HomeNudge, type SavedHomeEvent } from '@/lib/dashboard/homeFeed';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

const now = new Date(2026, 8, 27, 12).getTime();
const iso = (offset: number) => new Date(now + offset * 3_600_000).toISOString();
const event = (overrides: Partial<SavedHomeEvent> = {}): SavedHomeEvent => ({ beacon_id: 'saved', title: 'Coffee', created_at: iso(-24), event_start_at: iso(-1), event_end_at: iso(1), location_name: null, ...overrides });
const nudge = (kind: string): HomeNudge => ({ id: kind, nudge_type: kind, connection_id: 'c1', beacon_id: null, headline: kind, body: '', payload: {} });
const urgent: ConnectionRecord = { id: 'c1', name: 'Lena', location: '', dateMet: new Date(now - 40 * 3_600_000), status: 'pending' };

test('group revival opens the payload group instead of requiring a direct connection id', () => {
  const group = { ...urgent, id: 'group', chatKind: 'group_clique' as const, groupChatId: 'chat' };
  expect(nudgeConnection({ ...nudge('group_revival'), connection_id: null, payload: { group_id: 'group', chat_id: 'chat' } }, [urgent, group])).toBe(group);
  expect(nudgeConnection({ ...nudge('group_revival'), payload: { group_id: 'missing' } }, [urgent, group])).toBeUndefined();
});

test('unavailable bookmarks never become event opportunities; invalid schedules stay in saved events', () => {
  expect(savedEventState(event({ created_at: null }), now)).toBe('unavailable');
  expect(savedEventState(event({ event_start_at: null, event_end_at: null }), now)).toBe('upcoming');
  expect(selectHomeOpportunity([event({ event_end_at: iso(-2) })], [], [], now)).toBeNull();
  expect(savedEventState(event({ event_end_at: iso(0) }), now)).toBe('past');
});

test('native priority: saved live/today, nearby live, hangout, shared event, wave, urgent hello, anniversary, reconnect', () => {
  const all = ['reconnect_lull', 'anniversary', 'wave', 'shared_upcoming_event', 'hangout_confirm'].map(nudge);
  expect(selectHomeOpportunity([event()], all, [urgent], now)?.kind).toBe('event');
  expect(selectHomeOpportunity([event({ event_start_at: iso(2), event_end_at: iso(3) })], all, [urgent], now)?.kind).toBe('event');
  expect(selectHomeOpportunity([], all, [urgent], now, [event()])).toMatchObject({ kind: 'event', nearby: true });
  expect(selectHomeOpportunity([], all, [urgent], now)).toMatchObject({ kind: 'nudge', nudge: { nudge_type: 'hangout_confirm' } });
  expect(selectHomeOpportunity([], all.slice(0, 4), [urgent], now)).toMatchObject({ kind: 'nudge', nudge: { nudge_type: 'shared_upcoming_event' } });
  expect(selectHomeOpportunity([], all.slice(0, 3), [urgent], now)).toMatchObject({ kind: 'nudge', nudge: { nudge_type: 'wave' } });
  expect(selectHomeOpportunity([], all.slice(0, 2), [urgent], now)?.kind).toBe('sayHi');
  expect(selectHomeOpportunity([], all.slice(0, 2), [], now)).toMatchObject({ kind: 'nudge', nudge: { nudge_type: 'anniversary' } });
});

test('archived connections, groups, expired deadlines and ongoing chats are not first-message prompts', () => {
  for (const connection of [{ ...urgent, status: 'archived' as const }, { ...urgent, chatKind: 'group_clique' as const }, { ...urgent, dateMet: new Date(now - 49 * 3_600_000) }, { ...urgent, lastMessageAt: now - 6 * 86_400_000 }]) {
    expect(selectHomeOpportunity([], [], [connection], now)).toBeNull();
  }
});

test('greetings use local time and the first name', () => {
  expect(homeGreeting(' Lena Park ', now)).toBe('Good afternoon, Lena');
  expect(homeGreeting('', new Date(2026, 8, 27, 6).getTime())).toBe('Good morning');
});
