/**
 * Avatar fallback colors, identical to iOS `ClickColors.GeneratedContent.avatarPalette`
 * and Android `PlaceholderAvatarColors`, so a person gets the same color everywhere.
 */
export const AVATAR_PALETTE = [
  '#4F46E5',
  '#7C3AED',
  '#0D9488',
  '#2563EB',
  '#BE185D',
  '#B45309',
  '#0F766E',
  '#4338CA',
  '#15803D',
  '#92400E',
] as const;

/** Java `String.hashCode` over UTF-16 units with Int32 wrapping, masked non-negative. */
export function avatarPaletteIndex(seed: string | null | undefined): number {
  if (!seed || seed.trim().length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return (hash & 0x7fffffff) % AVATAR_PALETTE.length;
}

export function avatarFallbackColor(seed: string | null | undefined): string {
  return AVATAR_PALETTE[avatarPaletteIndex(seed)];
}

/** One or two initials from a display name ("Ada Lovelace" → "AL", "ada" → "A"). */
export function avatarInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}
