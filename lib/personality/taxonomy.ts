/** Exactly five traits required on PATCH / onboarding. */
export const PERSONALITY_REQUIRED_TAG_COUNT = 5;

/**
 * Curated social traits (not Big Five jargon). Keep in sync with
 * `click/composeApp/.../PersonalityTaxonomy.kt`.
 */
export const PERSONALITY_TRAITS = [
  'Adventurous',
  'Empathetic',
  'Witty',
  'Curious',
  'Grounded',
  'Spontaneous',
  'Thoughtful',
  'Outgoing',
  'Chill',
  'Ambitious',
  'Creative',
  'Loyal',
  'Playful',
  'Independent',
  'Optimistic',
  'Analytical',
  'Warm',
  'Bold',
  'Easygoing',
  'Passionate',
  'Observant',
  'Supportive',
  'Humorous',
  'Authentic',
] as const;

export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

const BY_LOWER = new Map(PERSONALITY_TRAITS.map((trait) => [trait.toLowerCase(), trait]));

export function canonicalizePersonalityTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const canonical = BY_LOWER.get(raw.trim().toLowerCase());
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}
