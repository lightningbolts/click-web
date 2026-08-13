import {
  PERSONALITY_REQUIRED_TAG_COUNT,
  PERSONALITY_TRAITS,
  canonicalizePersonalityTags,
} from '@/lib/personality/taxonomy';

describe('personality taxonomy', () => {
  it('is unique and has a stable count', () => {
    const lower = PERSONALITY_TRAITS.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(PERSONALITY_TRAITS).toHaveLength(24);
    expect(PERSONALITY_REQUIRED_TAG_COUNT).toBe(5);
  });

  it('canonicalizes, drops unknown, and dedupes', () => {
    expect(canonicalizePersonalityTags(['witty', 'Witty', 'not-a-trait', 'Empathetic', '  curious  '])).toEqual([
      'Witty',
      'Empathetic',
      'Curious',
    ]);
  });
});
