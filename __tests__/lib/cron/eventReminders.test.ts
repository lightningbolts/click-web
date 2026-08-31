import { dueReminderKinds } from '@/lib/cron/eventReminders';

describe('dueReminderKinds', () => {
  const startMs = Date.parse('2026-08-12T14:30:00.000Z');
  const endMs = Date.parse('2026-08-12T16:00:00.000Z');

  it('fires thirty_min on an hourly :00 tick for an event starting at :30', () => {
    const nowMs = Date.parse('2026-08-12T14:00:00.000Z');
    expect(dueReminderKinds({ nowMs, startMs, endMs, metadata: {} })).toEqual([
      'day_of',
      'thirty_min',
    ]);
  });

  it('does not require the old 15-minute alignment window', () => {
    const nowMs = Date.parse('2026-08-12T14:20:00.000Z');
    expect(dueReminderKinds({ nowMs, startMs, endMs, metadata: {} })).toContain('thirty_min');
  });

  it('skips thirty_min when the legacy one_hour flag is set', () => {
    const nowMs = Date.parse('2026-08-12T14:00:00.000Z');
    expect(
      dueReminderKinds({
        nowMs,
        startMs,
        endMs,
        metadata: { one_hour_notification_sent: true },
      }),
    ).toEqual(['day_of']);
  });

  it('skips day_of and thirty_min after the event ends, and queues recap_ready', () => {
    const nowMs = Date.parse('2026-08-12T17:00:00.000Z');
    expect(dueReminderKinds({ nowMs, startMs, endMs, metadata: {} })).toEqual(['recap_ready']);
  });

  it('does not re-send recap_ready after recap_notification_sent', () => {
    const nowMs = Date.parse('2026-08-12T17:00:00.000Z');
    expect(
      dueReminderKinds({
        nowMs,
        startMs,
        endMs,
        metadata: { recap_notification_sent: true },
      }),
    ).toEqual([]);
  });

  it('day_of uses event timezone, not a UTC-midnight slice', () => {
    const nowMs = Date.parse('2026-08-12T18:00:00.000Z');
    expect(
      dueReminderKinds({
        nowMs,
        startMs,
        endMs: Date.parse('2026-08-13T02:00:00.000Z'),
        metadata: { event_timezone: 'America/Los_Angeles' },
      }),
    ).toContain('day_of');
  });

  it('does not fire day_of on the previous UTC day for a US-west event', () => {
    const nowMs = Date.parse('2026-08-12T04:00:00.000Z');
    expect(
      dueReminderKinds({
        nowMs,
        startMs,
        endMs,
        metadata: { event_timezone: 'America/Los_Angeles' },
      }),
    ).not.toContain('day_of');
  });
});
