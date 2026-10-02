import { ageLabel, confidenceChip, hereNowLine, NO_PULSE_COPY, patternLine, pulseLine } from '@/lib/places/labels';
import type { PulseSummary } from '@/lib/places/types';

describe('labels', () => {
  const nowMs = Date.parse('2026-10-01T20:00:00Z');
  const base: PulseSummary = {
    state: 'live',
    label: 'lively',
    energy_score: 3,
    report_count: 1,
    newest_at: new Date(nowMs - 4 * 60_000).toISOString(),
    confidence: 'low',
    distribution: [0, 0, 1, 0],
    talkable: { yes: 0, no: 0 },
    category: null,
    window_minutes: 90,
  };

  it('formats live, stale and empty Pulses', () => {
    expect(pulseLine(base, nowMs)).toBe('Lively · 1 report · 4 min ago');
    expect(pulseLine({ ...base, report_count: 3 }, nowMs)).toBe('Lively · 3 reports · 4 min ago');
    expect(
      pulseLine({ ...base, state: 'stale', label: 'chill', newest_at: new Date(nowMs - 3 * 3_600_000).toISOString() }, nowMs),
    ).toBe('Last Pulse: Chill · 3 h ago');
    expect(pulseLine({ ...base, state: 'none', label: null, newest_at: null }, nowMs)).toBe(NO_PULSE_COPY);
  });

  it('formats ages, confidence, patterns and here-now', () => {
    expect(ageLabel(new Date(nowMs - 10_000).toISOString(), nowMs)).toBe('just now');
    expect(ageLabel(new Date(nowMs - 2 * 86_400_000).toISOString(), nowMs)).toBe('2 d ago');
    expect(confidenceChip('medium')).toBe('Fair read');
    expect(patternLine({ label: 'lively', report_count: 6, weeks: 8 })).toBe('Usually Lively around now · 6 reports over 8 weeks');
    expect(hereNowLine(1)).toBe('1 here now');
    expect(hereNowLine(0)).toBeNull();
  });
});
