import { buildConnectionInsights, connectionActivity } from '@/lib/dashboard/connectionInsights';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

const now = Date.UTC(2026, 8, 26);
const day = 86_400_000;
function connection(id: string, days: number, extras: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return { id, name: id, location: 'Seattle', dateMet: new Date(now - days * day), status: 'kept', ...extras };
}

test.each([[7, 'active'], [8, 'cooling'], [14, 'cooling'], [15, 'dormant'], [30, 'dormant'], [31, 'inactive']])(
  'matches the mobile activity boundary at %s days', (days, expected) => {
    expect(connectionActivity(days as number)).toBe(expected);
  },
);
test('uses the newest message, excludes inactive relationships, and orders reminders oldest first', () => {
  const result = buildConnectionInsights([
    connection('old', 60), connection('cooling', 9),
    connection('recent-chat', 60, { lastMessageAt: now - day, chatLastMessageAt: now - 20 * day }),
    connection('archived', 90, { status: 'archived' }),
    connection('removed', 90, { status: 'removed' }),
    connection('group', 90, { chatKind: 'group_clique' }),
  ], now);
  expect(result.total).toBe(3);
  expect(result.active).toBe(1);
  expect(result.dormant).toBe(1);
  expect(result.reminders.map((r) => r.connection.id)).toEqual(['old', 'cooling']);
});
test('handles empty histories and invalid dates without invented reminders', () => {
  expect(buildConnectionInsights([], now).keepRate).toBe(0);
  expect(buildConnectionInsights([connection('invalid', 0, { dateMet: new Date('invalid') })], now).reminders).toEqual([]);
});
