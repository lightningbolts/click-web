import type { PersonalityTrait } from '@/lib/personality/taxonomy';

/**
 * Display grouping for the picker (spec §7.8). Presentation only: the saved value is still the
 * flat trait list shared with iOS and Android.
 */
export const PERSONALITY_GROUPS: readonly { label: string; traits: readonly PersonalityTrait[] }[] = [
  { label: 'Social', traits: ['Warm', 'Empathetic', 'Supportive', 'Loyal', 'Outgoing', 'Authentic'] },
  { label: 'Energy', traits: ['Adventurous', 'Spontaneous', 'Bold', 'Passionate', 'Playful', 'Optimistic'] },
  { label: 'Mind', traits: ['Curious', 'Thoughtful', 'Analytical', 'Observant', 'Ambitious', 'Independent'] },
  { label: 'Style', traits: ['Witty', 'Humorous', 'Chill', 'Easygoing', 'Grounded', 'Creative'] },
];
