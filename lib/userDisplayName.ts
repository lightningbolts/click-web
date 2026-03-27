import type { User } from '@supabase/supabase-js';

/** Read display label from auth user_metadata (split names preferred). */
export function displayNameFromUserMetadata(
  meta: User['user_metadata'] | null | undefined,
): string {
  if (!meta || typeof meta !== 'object') return '';
  const pick = (k: string): string => {
    const v = (meta as Record<string, unknown>)[k];
    if (typeof v !== 'string') return '';
    const t = v.trim();
    return t;
  };
  const fn = pick('first_name');
  const ln = pick('last_name');
  const combined = [fn, ln].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return pick('full_name') || pick('name') || '';
}

/** First/last for forms: prefers metadata fields, else splits full_name / name. */
export function firstLastFromUserMetadata(
  meta: User['user_metadata'] | null | undefined,
): { firstName: string; lastName: string } {
  if (!meta || typeof meta !== 'object') return { firstName: '', lastName: '' };
  const m = meta as Record<string, unknown>;
  const pick = (k: string): string => {
    const v = m[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const fn = pick('first_name');
  const ln = pick('last_name');
  if (fn || ln) return { firstName: fn, lastName: ln };
  const combined = pick('full_name') || pick('name');
  if (!combined) return { firstName: '', lastName: '' };
  const i = combined.indexOf(' ');
  if (i < 0) return { firstName: combined, lastName: '' };
  return {
    firstName: combined.slice(0, i).trim(),
    lastName: combined.slice(i + 1).trim(),
  };
}

/** Split a single display string into metadata fields (first word / remainder). */
export function splitNameForUserMetadata(display: string): {
  full_name: string;
  first_name: string;
  last_name: string;
} {
  const full_name = display.trim();
  if (!full_name) {
    return { full_name: '', first_name: '', last_name: '' };
  }
  const i = full_name.indexOf(' ');
  if (i < 0) {
    return { full_name, first_name: full_name, last_name: '' };
  }
  return {
    full_name,
    first_name: full_name.slice(0, i).trim(),
    last_name: full_name.slice(i + 1).trim(),
  };
}
