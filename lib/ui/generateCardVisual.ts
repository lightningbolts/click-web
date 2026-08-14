/**
 * Deterministic card / beacon visual identity. Mirrors mobile `generateCardVisual`.
 * 5/8 purple-dominant, 3/8 blue-dominant (62.5 / 37.5).
 */

export const CLICK_PURPLE = '#630ED4';
export const CLICK_BLUE = '#224CFF';

export type CardPattern = 'dots' | 'diagonals' | 'grain' | 'grid' | 'chevron';
export type BeaconPinShape =
  | 'circle'
  | 'rounded_square'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'rounded_rect'
  | 'squircle'
  | 'pentagon';

export type CardVisual = {
  id: string;
  hash: number;
  gradient: string[];
  pattern: CardPattern;
  purpleDominant: boolean;
  contentScrim: string;
  onContent: string;
  pinShape: BeaconPinShape;
};

const PURPLE_FAMILY = ['#630ED4', '#7C3AED', '#5A00C6', '#732EE4', '#4C1D95', '#D2BBFF'];
const BLUE_FAMILY = ['#224CFF', '#3D63FF', '#1A3FD9', '#0D2BB8', '#6B8CFF', '#102A9E'];
const PATTERNS: CardPattern[] = ['dots', 'diagonals', 'grain', 'grid', 'chevron'];

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export function generateCardVisual(
  id: string,
  pinShape: BeaconPinShape = 'rounded_square',
): CardVisual {
  const seed = id || 'click';
  const hash = fnv1a32(seed) >>> 0;
  const purpleDominant = hash % 8 < 5;
  const primary = purpleDominant ? PURPLE_FAMILY : BLUE_FAMILY;
  const secondary = purpleDominant ? BLUE_FAMILY : PURPLE_FAMILY;
  const stopA = primary[Math.floor(hash / 8) % primary.length]!;
  const stopB = primary[Math.floor(hash / 64) % primary.length]!;
  const stopC = secondary[Math.floor(hash / 512) % secondary.length]!;
  const gradient = Array.from(new Set([stopA, stopB, stopC]));
  const pattern = PATTERNS[Math.floor(hash / 7) % PATTERNS.length]!;
  return {
    id: seed,
    hash: hash | 0,
    gradient,
    pattern,
    purpleDominant,
    contentScrim: 'rgba(0,0,0,0.42)',
    onContent: '#ffffff',
    pinShape,
  };
}

export function beaconPinShapeFor(kind: string | null | undefined): BeaconPinShape {
  switch ((kind ?? '').toLowerCase()) {
    case 'soundtrack':
      return 'circle';
    case 'event':
      return 'rounded_square';
    case 'hazard':
      return 'triangle';
    case 'sos':
      return 'diamond';
    case 'utility':
      return 'hexagon';
    case 'study':
      return 'rounded_rect';
    case 'social':
    case 'social_vibe':
      return 'squircle';
    default:
      return 'pentagon';
  }
}

export function accentColorForStableId(id: string): string {
  const hash = fnv1a32(id || 'click') >>> 0;
  return hash % 8 < 5 ? CLICK_PURPLE : CLICK_BLUE;
}
