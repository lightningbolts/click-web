import { isValidSlug, slugCandidates, slugifyPlaceName } from '@/lib/places/slug';

describe('slugs', () => {
  it('slugifies names with diacritics, ampersands and a city', () => {
    expect(slugifyPlaceName('Café Allegro', 'Seattle')).toBe('cafe-allegro-seattle');
    expect(slugifyPlaceName('Ben & Jerry’s', null)).toBe('ben-and-jerry-s');
    expect(slugifyPlaceName('  --Hello__World--  ')).toBe('hello-world');
  });

  it('cuts long names at a dash boundary', () => {
    const slug = slugifyPlaceName('the quick brown fox jumps over the lazy dog and keeps on running far away');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });

  it('validates like the DB constraint', () => {
    expect(isValidSlug('cafe-allegro')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('Cafe')).toBe(false);
    expect(isValidSlug('a--b')).toBe(false);
    expect(isValidSlug('a'.repeat(81))).toBe(false);
  });

  it('offers collision suffixes up to -20', () => {
    const c = slugCandidates('cafe');
    expect(c[0]).toBe('cafe');
    expect(c[1]).toBe('cafe-2');
    expect(c.at(-1)).toBe('cafe-20');
    expect(c).toHaveLength(20);
  });
});
