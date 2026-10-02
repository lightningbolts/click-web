import { categoryLabel, categoryQuestionKey, isPlaceCategory, PLACE_CATEGORIES } from '@/lib/places/categories';

describe('categories', () => {
  it('lists the twelve eligible categories and no excluded ones', () => {
    expect(PLACE_CATEGORIES).toHaveLength(12);
    expect(isPlaceCategory('church')).toBe(false);
    expect(isPlaceCategory('clinic')).toBe(false);
  });

  it('labels and maps category questions', () => {
    expect(categoryLabel('cafe')).toBe('Café');
    expect(categoryLabel('other')).toBe('Place');
    expect(categoryQuestionKey('music_venue')).toBe('line');
    expect(categoryQuestionKey('bookstore')).toBeNull();
  });
});
