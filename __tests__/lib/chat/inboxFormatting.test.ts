import { inboxPreview, inboxTimestamp, sayHiRemaining } from '@/lib/chat/inboxFormatting';

const tz = 'America/Los_Angeles';
// Wed 2026-10-07 15:30 PDT
const now = Date.UTC(2026, 9, 7, 22, 30);

describe('inboxTimestamp', () => {
  it('shows the time for today', () => {
    expect(inboxTimestamp(Date.UTC(2026, 9, 7, 16, 5), now, { timeZone: tz, locale: 'en-US' })).toBe('9:05 AM');
  });

  it('uses the viewer time zone for day boundaries', () => {
    // 2026-10-07 05:00 UTC is still Oct 6 in Los Angeles.
    expect(inboxTimestamp(Date.UTC(2026, 9, 7, 5, 0), now, { timeZone: tz, locale: 'en-US' })).toBe('Yesterday');
  });

  it('shows the weekday for 2–6 days ago', () => {
    expect(inboxTimestamp(Date.UTC(2026, 9, 5, 18), now, { timeZone: tz, locale: 'en-US' })).toBe('Mon');
    expect(inboxTimestamp(Date.UTC(2026, 9, 1, 18), now, { timeZone: tz, locale: 'en-US' })).toBe('Thu');
  });

  it('shows M/D from a week ago', () => {
    expect(inboxTimestamp(Date.UTC(2026, 8, 30, 18), now, { timeZone: tz, locale: 'en-US' })).toBe('9/30');
  });

  it('treats future timestamps as today', () => {
    expect(inboxTimestamp(now + 60_000, now, { timeZone: tz, locale: 'en-US' })).toBe('3:31 PM');
  });
});

describe('sayHiRemaining', () => {
  it('rounds up to whole hours', () => {
    expect(sayHiRemaining(now + 35.2 * 3600_000, now)).toBe('36h left');
  });
  it('collapses the last hour', () => {
    expect(sayHiRemaining(now + 20 * 60_000, now)).toBe('<1h left');
  });
  it('is null once closed', () => {
    expect(sayHiRemaining(now - 1, now)).toBeNull();
  });
});

describe('inboxPreview', () => {
  it('prefers the latest message label', () => {
    expect(inboxPreview({ latest: 'Photo', sayHiOpen: true, location: 'Café' })).toBe('Photo');
  });
  it('invites a hello inside the say-hi window', () => {
    expect(inboxPreview({ latest: null, sayHiOpen: true, location: 'Café' })).toBe('New Click · say hi');
  });
  it('falls back to where you met', () => {
    expect(inboxPreview({ latest: '  ', sayHiOpen: false, location: 'Café Allegro' })).toBe('Met at Café Allegro');
  });
  it('has a neutral last resort', () => {
    expect(inboxPreview({ latest: null, sayHiOpen: false })).toBe('New Click');
  });
});
