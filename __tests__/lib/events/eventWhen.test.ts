import { eventWhenLines } from '@/lib/events/eventWhen';

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';

describe('eventWhenLines', () => {
  it('formats date and a same-day range in the viewer zone', () => {
    const w = eventWhenLines('2026-10-08T01:00:00Z', '2026-10-08T03:00:00Z', LA, LA)!;
    expect(w.month).toBe('Oct');
    expect(w.day).toBe('7');
    expect(w.dateLine).toBe('Wednesday, October 7');
    expect(w.timeLine).toMatch(/^6:00\s?–\s?8:00\sPM PDT$/);
    expect(w.eventLocal).toBeNull();
  });

  it('adds the event zone when it shows a different clock', () => {
    const w = eventWhenLines('2026-10-08T01:00:00Z', '2026-10-08T03:00:00Z', LA, NY)!;
    expect(w.eventLocal).toMatch(/^9:00\s?–\s?11:00\sPM EDT local$/);
  });

  it('handles no end, and an end before the start', () => {
    expect(eventWhenLines('2026-10-08T01:00:00Z', null, LA, null)!.timeLine).toBe('6:00 PM PDT');
    expect(eventWhenLines('2026-10-08T01:00:00Z', '2026-10-07T00:00:00Z', LA, null)!.timeLine).toBe('6:00 PM PDT');
  });

  it('names the end day for overnight events', () => {
    const w = eventWhenLines('2026-10-08T05:00:00Z', '2026-10-08T09:00:00Z', LA, null)!;
    expect(w.timeLine).toBe('10:00 PM – Oct 8, 2:00 AM PDT');
  });

  it('adds the year for other years and returns null without a start', () => {
    expect(eventWhenLines('2030-01-04T18:00:00Z', null, LA, null)!.dateLine).toBe('Friday, January 4, 2030');
    expect(eventWhenLines(null, null, LA, null)).toBeNull();
  });
});
