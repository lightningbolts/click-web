/** @jest-environment node */

import { chatDropRevealAtMs, dropDevelopState } from '@/lib/drops/developState';

describe('dropDevelopState', () => {
  const reveal = Date.parse('2026-10-01T10:00:00Z');

  it('is pending until reveal_at, whatever the viewer state', () => {
    expect(dropDevelopState(reveal, null, reveal - 1)).toBe('pending');
    expect(dropDevelopState(reveal, '2026-10-01T09:00:00Z', reveal - 1)).toBe('pending');
  });

  it('is ready at reveal_at until the viewer develops it', () => {
    expect(dropDevelopState(reveal, null, reveal)).toBe('ready');
    expect(dropDevelopState(reveal, undefined, reveal + 60_000)).toBe('ready');
  });

  it('is developed once the viewer has a developed_at', () => {
    expect(dropDevelopState(reveal, '2026-10-01T10:05:00Z', reveal + 1)).toBe('developed');
  });

  it('treats an unparseable reveal time as pending (never leaks early)', () => {
    expect(dropDevelopState(NaN, null, reveal)).toBe('pending');
  });
});

describe('chatDropRevealAtMs', () => {
  it('reads reveal_at, falling back to collaboration_ttl', () => {
    expect(chatDropRevealAtMs({ disposable_roll: true, reveal_at: '2026-10-01T10:00:00Z' })).toBe(
      Date.parse('2026-10-01T10:00:00Z'),
    );
    expect(chatDropRevealAtMs({ disposable_roll: true, collaboration_ttl: '2026-10-02T10:00:00Z' })).toBe(
      Date.parse('2026-10-02T10:00:00Z'),
    );
  });

  it('ignores non-drops and unparseable times', () => {
    expect(chatDropRevealAtMs({ reveal_at: '2026-10-01T10:00:00Z' })).toBeNull();
    expect(chatDropRevealAtMs({ disposable_roll: true, reveal_at: 'soon' })).toBeNull();
    expect(chatDropRevealAtMs(null)).toBeNull();
  });
});
