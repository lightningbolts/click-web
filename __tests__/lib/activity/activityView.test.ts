import { activityKind, groupActivity, requestConnectionId } from '@/lib/activity/activityView';
import { groupByMonth } from '@/lib/me/monthGroups';

const NOW = Date.parse('2026-10-08T18:00:00Z'); // Thursday, 11 AM in Los Angeles
const at = (iso: string) => ({ created_at: iso });

describe('activityView (spec §7.9)', () => {
  it('maps item types to kind badges', () => {
    expect(activityKind('reaction')).toBe('reaction');
    expect(activityKind('new_connection')).toBe('connection');
    expect(activityKind('prior_connection_accepted')).toBe('connection');
    expect(activityKind('event_rsvp_request')).toBe('event');
    expect(activityKind('friends_going')).toBe('event');
    expect(activityKind('wave')).toBe('wave');
    expect(activityKind('reconnect_nudge')).toBe('streak');
    expect(activityKind('system')).toBe('other');
  });

  it('groups by New, Today, Yesterday, This week and Earlier in the viewer zone', () => {
    const items = [
      at('2026-10-08T17:00:00Z'), // after seen → New
      at('2026-10-08T08:00:00Z'), // 1 AM LA today
      at('2026-10-08T06:00:00Z'), // 11 PM LA yesterday
      at('2026-10-04T12:00:00Z'), // this week
      at('2026-09-01T12:00:00Z'), // earlier
    ];
    const groups = groupActivity(items, { seenAt: '2026-10-08T16:00:00Z', nowMs: NOW, timeZone: 'America/Los_Angeles' });
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ['new', 1],
      ['today', 1],
      ['yesterday', 1],
      ['week', 1],
      ['earlier', 1],
    ]);
    expect(groupActivity(items, { seenAt: null, nowMs: NOW, timeZone: 'UTC' }).map((g) => g.key)).toEqual(['new']);
  });

  it('offers inline answers only for prior requests with a connection', () => {
    expect(requestConnectionId({ type: 'prior_connection_request', data: { connection_id: 'c1' } })).toBe('c1');
    expect(requestConnectionId({ type: 'prior_connection_request', data: {} })).toBeNull();
    expect(requestConnectionId({ type: 'wave', data: { connection_id: 'c1' } })).toBeNull();
  });

  it('groups history by month, newest first, skipping undated rows', () => {
    const rows = [{ ms: Date.parse('2026-10-02T00:00:00Z') }, { ms: Date.parse('2026-10-01T12:00:00Z') }, { ms: NaN }, { ms: Date.parse('2026-08-15T00:00:00Z') }];
    expect(groupByMonth(rows, (r) => r.ms, 'UTC').map((g) => [g.title, g.items.length])).toEqual([
      ['October 2026', 2],
      ['August 2026', 1],
    ]);
  });
});
