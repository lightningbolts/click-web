import { isOpenAt, localParts, parsePlaceHours, todayHoursLabel } from '@/lib/places/hours';

const TZ = 'America/Los_Angeles';

describe('parsePlaceHours', () => {
  it('accepts the documented shape', () => {
    expect(parsePlaceHours({ mon: [['07:00', '15:00']], fri: [['07:00', '15:00'], ['18:00', '02:00']] })).toEqual({
      mon: [['07:00', '15:00']],
      fri: [['07:00', '15:00'], ['18:00', '02:00']],
    });
    expect(parsePlaceHours({})).toEqual({});
  });

  it.each([
    ['null', null],
    ['an array', [['07:00', '15:00']]],
    ['an unknown day', { monday: [['07:00', '15:00']] }],
    ['a bad time', { mon: [['7:00', '15:00']] }],
    ['24:00', { mon: [['07:00', '24:00']] }],
    ['a single time', { mon: [['07:00']] }],
  ])('rejects %s', (_, value) => {
    expect(parsePlaceHours(value)).toBeNull();
  });
});

describe('isOpenAt', () => {
  const hours = { mon: [['07:00', '15:00']] as [string, string][], fri: [['18:00', '02:00']] as [string, string][] };

  it('is null when hours are unknown', () => {
    expect(isOpenAt(null, TZ, Date.now())).toBeNull();
  });

  it('uses local time on both sides of the DST change', () => {
    // Monday 2026-11-02 14:30 PST = 22:30Z → open.
    expect(isOpenAt(hours, TZ, Date.parse('2026-11-02T22:30:00Z'))).toBe(true);
    // Monday 2026-10-26 22:30Z = 15:30 PDT → closed.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-26T22:30:00Z'))).toBe(false);
    // Monday 2026-10-26 14:30 PDT = 21:30Z → open.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-26T21:30:00Z'))).toBe(true);
  });

  it('handles intervals that run past midnight', () => {
    // Saturday 2026-10-03 01:00 PDT = 08:00Z, inside Friday 18:00–02:00.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-03T08:00:00Z'))).toBe(true);
    // Saturday 03:00 PDT → closed.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-03T10:00:00Z'))).toBe(false);
    // Friday 23:00 PDT → open.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-03T06:00:00Z'))).toBe(true);
  });

  it('treats a missing day as closed', () => {
    // Tuesday noon.
    expect(isOpenAt(hours, TZ, Date.parse('2026-10-06T19:00:00Z'))).toBe(false);
  });
});

describe('todayHoursLabel', () => {
  const hours = {
    mon: [['07:00', '15:00']] as [string, string][],
    fri: [['07:30', '15:00'], ['18:00', '02:00']] as [string, string][],
  };

  it('formats local intervals', () => {
    expect(todayHoursLabel(hours, TZ, Date.parse('2026-10-05T19:00:00Z'))).toBe('7 AM – 3 PM');
    expect(todayHoursLabel(hours, TZ, Date.parse('2026-10-02T19:00:00Z'))).toBe('7:30 AM – 3 PM, 6 PM – 2 AM');
  });

  it('says closed today, or null when unknown', () => {
    expect(todayHoursLabel(hours, TZ, Date.parse('2026-10-06T19:00:00Z'))).toBe('Closed today');
    expect(todayHoursLabel(null, TZ, Date.now())).toBeNull();
  });

  it('uses the Place timezone for the weekday', () => {
    // 2026-10-06T05:00Z is Monday 22:00 in Los Angeles but Tuesday in UTC.
    expect(localParts(TZ, Date.parse('2026-10-06T05:00:00Z')).weekday).toBe('mon');
    expect(todayHoursLabel(hours, TZ, Date.parse('2026-10-06T05:00:00Z'))).toBe('7 AM – 3 PM');
  });
});
