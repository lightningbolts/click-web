import { formatEventWhen, formatMonth, formatRelativeShort, formatTimeLeft } from '@/lib/home/format';

const NOW = Date.parse('2026-10-05T15:00:00Z'); // Monday
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('formatEventWhen', () => {
  it('names today, tomorrow and this week', () => {
    expect(formatEventWhen(iso(NOW + 4 * H), 'UTC', NOW)).toBe('Today 7:00 PM');
    expect(formatEventWhen(iso(NOW + 20 * H), 'UTC', NOW)).toBe('Tomorrow 11:00 AM');
    expect(formatEventWhen(iso(NOW + 4 * 24 * H), 'UTC', NOW)).toBe('Fri 3:00 PM');
    expect(formatEventWhen(iso(NOW + 10 * 24 * H), 'UTC', NOW)).toBe('Oct 15, 3:00 PM');
  });

  it('uses the viewer’s zone for the day boundary', () => {
    expect(formatEventWhen(iso(NOW + 10 * H), 'UTC', NOW)).toBe('Tomorrow 1:00 AM');
    expect(formatEventWhen(iso(NOW + 10 * H), 'America/New_York', NOW)).toBe('Today 9:00 PM');
  });

  it('handles a missing date', () => {
    expect(formatEventWhen(null, 'UTC', NOW)).toBe('Date to be announced');
  });
});

describe('small formats', () => {
  it('formats time left', () => {
    expect(formatTimeLeft(NOW + 45 * 60_000, NOW)).toBe('45m');
    expect(formatTimeLeft(NOW + 12.5 * H, NOW)).toBe('12h');
    expect(formatTimeLeft(NOW - H, NOW)).toBe('0m');
  });

  it('formats a month chapter', () => {
    expect(formatMonth('2026-09-01')).toBe('September 2026');
  });

  it('formats relative times', () => {
    expect(formatRelativeShort(iso(NOW - 20_000), NOW)).toBe('now');
    expect(formatRelativeShort(iso(NOW - 5 * 60_000), NOW)).toBe('5m');
    expect(formatRelativeShort(iso(NOW - 3 * H), NOW)).toBe('3h');
    expect(formatRelativeShort(iso(NOW - 50 * H), NOW)).toBe('2d');
    expect(formatRelativeShort('nope', NOW)).toBe('');
  });
});
