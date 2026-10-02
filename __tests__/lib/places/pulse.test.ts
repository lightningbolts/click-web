import { DEFAULT_PLACES_CONFIG } from '@/lib/places/config';
import { energyLabel, PULSE_QUESTIONS_VERSION, pulsePattern, pulseQuestionsFor, summarizePulse } from '@/lib/places/pulse';
import type { PulseRow } from '@/lib/places/types';

const NOW = Date.parse('2026-10-01T20:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const row = (energy: number | null, ageMin: number, extra: Partial<PulseRow> = {}): PulseRow => ({
  energy,
  proof_weight: 1,
  created_at: minutesAgo(ageMin),
  ...extra,
});

describe('pulseQuestionsFor', () => {
  it('orders present questions energy → category → talkable, then the leaving question', () => {
    const qs = pulseQuestionsFor('cafe');
    expect(qs.map((q) => [q.key, q.phase])).toEqual([
      ['energy', 'present'],
      ['category', 'present'],
      ['talkable', 'present'],
      ['would_return', 'leaving'],
    ]);
    expect(qs[0]).toMatchObject({ prompt: "How's the energy?", required: true });
    expect(qs[0].options.map((o) => o.label)).toEqual(['Chill', 'Steady', 'Lively', 'Packed']);
    expect(qs[1]).toMatchObject({ category_question: 'seats', prompt: 'Seats available?' });
  });

  it.each([
    ['bar', 'line', 'Line at the door?'],
    ['restaurant', 'wait', 'Wait for a table?'],
    ['gym', 'equipment', 'Wait for equipment?'],
  ] as const)('asks the %s category question', (category, key, prompt) => {
    const q = pulseQuestionsFor(category).find((x) => x.key === 'category');
    expect(q).toMatchObject({ category_question: key, prompt, required: false });
  });

  it('skips the category question when the category has none', () => {
    expect(pulseQuestionsFor('bookstore').map((q) => q.key)).toEqual(['energy', 'talkable', 'would_return']);
    expect(pulseQuestionsFor('other').map((q) => q.key)).toEqual(['energy', 'talkable', 'would_return']);
  });

  it('is version 1', () => {
    expect(PULSE_QUESTIONS_VERSION).toBe(1);
  });
});

describe('energyLabel', () => {
  it('uses the spec cut-offs', () => {
    expect([1, 1.74, 1.75, 2.49, 2.5, 3.24, 3.25, 4].map(energyLabel)).toEqual([
      'chill', 'chill', 'steady', 'steady', 'lively', 'lively', 'packed', 'packed',
    ]);
  });
});

describe('summarizePulse', () => {
  it('shows a single Pulse as live with one report and low confidence (no threshold)', () => {
    const s = summarizePulse([row(3, 4)], NOW, DEFAULT_PLACES_CONFIG);
    expect(s).toMatchObject({
      state: 'live',
      label: 'lively',
      energy_score: 3,
      report_count: 1,
      confidence: 'low',
      newest_at: minutesAgo(4),
      window_minutes: 90,
    });
  });

  it('decays older Pulses toward the fresh reading', () => {
    const s = summarizePulse([row(4, 80), row(1, 0)], NOW, DEFAULT_PLACES_CONFIG);
    expect(s.state).toBe('live');
    expect(s.energy_score).toBeLessThan(2.5);
    expect(s.label).toBe('chill');
  });

  it('weights by proof', () => {
    const s = summarizePulse([row(4, 0, { proof_weight: 0.2 }), row(2, 0, { proof_weight: 1 })], NOW, DEFAULT_PLACES_CONFIG);
    expect(s.energy_score).toBeCloseTo((0.2 * 4 + 2) / 1.2, 2);
  });

  it('reports a stale reading from the last Pulse when the window is empty', () => {
    const s = summarizePulse([row(1, 180), row(4, 600)], NOW, DEFAULT_PLACES_CONFIG);
    expect(s).toMatchObject({
      state: 'stale',
      label: 'chill',
      energy_score: null,
      report_count: 0,
      confidence: null,
      newest_at: minutesAgo(180),
    });
  });

  it('reports none when nothing is in the lookback', () => {
    const s = summarizePulse([row(3, 60 * 24 * 8)], NOW, DEFAULT_PLACES_CONFIG);
    expect(s).toMatchObject({ state: 'none', label: null, report_count: 0, newest_at: null });
  });

  it('keeps the distribution as raw counts and counts follow-ups in the window', () => {
    const s = summarizePulse(
      [
        row(3, 1, { talkable: 1, category_question: 'seats', category_answer: 2 }),
        row(3, 50, { talkable: 0, category_question: 'seats', category_answer: 3 }),
        row(1, 89, { talkable: 1 }),
        row(4, 200),
        row(null, 5, { would_return: 1 }),
      ],
      NOW,
      DEFAULT_PLACES_CONFIG,
    );
    expect(s.distribution).toEqual([1, 0, 2, 0]);
    expect(s.report_count).toBe(3);
    expect(s.talkable).toEqual({ yes: 2, no: 1 });
    expect(s.category).toEqual({ question: 'seats', counts: [0, 1, 1] });
  });

  it('rates confidence descriptively', () => {
    const many = Array.from({ length: 8 }, (_, i) => row(2, i));
    expect(summarizePulse(many, NOW, DEFAULT_PLACES_CONFIG).confidence).toBe('high');
    expect(summarizePulse(many.slice(0, 3), NOW, DEFAULT_PLACES_CONFIG).confidence).toBe('medium');
  });
});

describe('pulsePattern', () => {
  const TZ = 'America/Los_Angeles';
  // Sunday 2026-11-08 10:30 PST (DST ended 2026-11-01).
  const now = Date.parse('2026-11-08T18:30:00.000Z');

  it('matches local weekday and ±1 local hour across a DST change', () => {
    const pulses: PulseRow[] = [
      // Sunday 2026-10-25 11:45 PDT → local hour 11: included.
      { energy: 4, proof_weight: 1, created_at: '2026-10-25T18:45:00.000Z' },
      // Sunday 2026-10-25 09:10 PDT → local hour 9: included.
      { energy: 2, proof_weight: 1, created_at: '2026-10-25T16:10:00.000Z' },
      // Sunday 2026-10-25 12:00 PDT → local hour 12 (UTC hour 19 would look adjacent): excluded.
      { energy: 1, proof_weight: 1, created_at: '2026-10-25T19:00:00.000Z' },
      // Saturday 2026-11-07 10:30 PST: wrong weekday.
      { energy: 1, proof_weight: 1, created_at: '2026-11-07T18:30:00.000Z' },
      // Would-return-only row: ignored.
      { energy: null, proof_weight: 1, created_at: '2026-11-01T18:30:00.000Z' },
    ];
    expect(pulsePattern(pulses, TZ, now, 8)).toEqual({ label: 'lively', report_count: 2, weeks: 8 });
  });

  it('returns a single matching Pulse and null when nothing matches', () => {
    expect(pulsePattern([{ energy: 1, proof_weight: 1, created_at: '2026-11-01T18:00:00.000Z' }], TZ, now, 8)).toEqual({
      label: 'chill',
      report_count: 1,
      weeks: 8,
    });
    expect(pulsePattern([], TZ, now, 8)).toBeNull();
  });

  it('ignores Pulses older than the pattern window', () => {
    const old = { energy: 4, proof_weight: 1, created_at: '2026-08-02T17:30:00.000Z' };
    expect(pulsePattern([old], TZ, now, 8)).toBeNull();
  });
});
