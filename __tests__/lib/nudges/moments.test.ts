import {
  addUtcMonths,
  dueAnniversary,
  GROUP_QUIET_MS,
  GROUP_REVIVAL_MAX_MS,
  isGroupRevivalDue,
  isMemoryPromptDue,
  NUDGE_TYPES,
  nudgeCopy,
} from '@/lib/nudges/moments';

const HOUR = 60 * 60 * 1000;
const met = Date.UTC(2025, 2, 14, 19, 30); // Mar 14 2025, 19:30 UTC

describe('addUtcMonths', () => {
  it('clamps to the last day of shorter months', () => {
    expect(new Date(addUtcMonths(Date.UTC(2026, 0, 31, 12), 1)).toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });
  it('goes backwards', () => {
    expect(new Date(addUtcMonths(Date.UTC(2026, 2, 15), -1)).toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });
});

describe('dueAnniversary', () => {
  it('fires at the first-meeting time of day, one month / six months / a year later', () => {
    expect(dueAnniversary(met, addUtcMonths(met, 1) + 30 * 60 * 1000)?.label).toBe('1 month');
    expect(dueAnniversary(met, addUtcMonths(met, 6) + HOUR)?.key).toBe('m6');
    expect(dueAnniversary(met, addUtcMonths(met, 12))?.label).toBe('1 year');
    expect(dueAnniversary(met, addUtcMonths(met, 36) + HOUR)?.label).toBe('3 years');
  });
  it('is quiet outside the window and on ordinary days', () => {
    expect(dueAnniversary(met, addUtcMonths(met, 1) - 1)).toBeNull();
    expect(dueAnniversary(met, addUtcMonths(met, 1) + 2 * HOUR)).toBeNull();
    expect(dueAnniversary(met, met + 45 * 24 * HOUR)).toBeNull();
  });
});

describe('memory prompts and group revival', () => {
  it('prompts the day after, around the same time', () => {
    const at = Date.UTC(2026, 8, 1, 20);
    expect(isMemoryPromptDue(at, at + 19 * HOUR)).toBe(false);
    expect(isMemoryPromptDue(at, at + 24 * HOUR)).toBe(true);
    expect(isMemoryPromptDue(at, at + 28 * HOUR)).toBe(false);
  });
  it('revives groups quiet for three weeks, not long-dead ones', () => {
    const now = Date.UTC(2026, 8, 25);
    expect(isGroupRevivalDue(now - GROUP_QUIET_MS + HOUR, now)).toBe(false);
    expect(isGroupRevivalDue(now - GROUP_QUIET_MS, now)).toBe(true);
    expect(isGroupRevivalDue(now - GROUP_REVIVAL_MAX_MS, now)).toBe(false);
  });
});

describe('nudgeCopy', () => {
  it('has copy for every kind and uses the payload', () => {
    for (const type of NUDGE_TYPES) {
      const copy = nudgeCopy(type, { peer_first_name: 'Maya', place_name: 'Café Allegro', group_name: 'Climbers' });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
    expect(nudgeCopy('anniversary', { peer_first_name: 'Maya', milestone_label: '1 year' }).title).toBe('1 year since you met Maya');
    expect(nudgeCopy('hangout_confirm', { peer_first_name: 'Maya', source: 'nearby' }).title).toBe('Hanging out with Maya?');
    expect(nudgeCopy('group_revival', { group_name: 'Climbers', quiet_days: 28 }).body).toBe('4 weeks without a message. Plan something?');
  });
});
