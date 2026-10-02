import type { CategoryQuestionKey, PlaceCategory } from '@/lib/places/types';

/** §1.3. The enum has no value for never-eligible places (homes, clinics, worship, schools…). */
export const PLACE_CATEGORIES: readonly PlaceCategory[] = [
  'cafe',
  'bar',
  'nightlife',
  'music_venue',
  'restaurant',
  'gym',
  'coworking',
  'study_space',
  'entertainment',
  'bookstore',
  'campus_space',
  'other',
] as const;

const LABELS: Record<PlaceCategory, string> = {
  cafe: 'Café',
  bar: 'Bar',
  nightlife: 'Nightlife',
  music_venue: 'Music venue',
  restaurant: 'Restaurant',
  gym: 'Gym',
  coworking: 'Coworking',
  study_space: 'Study space',
  entertainment: 'Entertainment',
  bookstore: 'Bookstore',
  campus_space: 'Campus space',
  other: 'Place',
};

const QUESTIONS: Record<PlaceCategory, CategoryQuestionKey | null> = {
  cafe: 'seats',
  bar: 'line',
  nightlife: 'line',
  music_venue: 'line',
  restaurant: 'wait',
  gym: 'equipment',
  coworking: 'seats',
  study_space: 'seats',
  entertainment: 'line',
  bookstore: null,
  campus_space: 'seats',
  other: null,
};

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === 'string' && (PLACE_CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(category: PlaceCategory | null | undefined): string {
  return category && isPlaceCategory(category) ? LABELS[category] : LABELS.other;
}

export function categoryQuestionKey(category: PlaceCategory | null | undefined): CategoryQuestionKey | null {
  return category && isPlaceCategory(category) ? QUESTIONS[category] : null;
}
