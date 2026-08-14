/**
 * Deterministic card / beacon visual identity. Mirrors mobile `ui/theme/CardVisual.kt` +
 * `ui/theme/Contrast.kt` — same FNV-1a seed, same 16 hue buckets, same WCAG scrim search.
 *
 * Two separate systems live in this file, and they must stay separate:
 * - `generateCardVisual` paints **content** identity from the full hue palette so individual
 *   beacons / events / connections are visually distinguishable.
 * - `accentColorForStableId` is **UI chrome** and stays on the 60/40–65/35 purple/blue ratio.
 */

export const CLICK_PURPLE = '#630ED4';
export const CLICK_BLUE = '#224CFF';

export type CardPattern = 'dots' | 'diagonals' | 'grain' | 'grid' | 'chevron';
export type CardHueFamily = 'purple' | 'blue' | 'teal' | 'coral' | 'gold' | 'magenta' | 'green';
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
  hueFamily: CardHueFamily;
  /** Kept for map/pin parity with mobile; the palette is no longer purple-or-blue only. */
  purpleDominant: boolean;
  scrimAlpha: number;
  contentScrim: string;
  onContent: string;
  pinShape: BeaconPinShape;
};

const HUE_STOPS: Record<CardHueFamily, string[]> = {
  purple: ['#630ED4', '#7C3AED', '#5A00C6', '#732EE4', '#4C1D95', '#D2BBFF'],
  blue: ['#224CFF', '#3D63FF', '#1A3FD9', '#0D2BB8', '#6B8CFF', '#102A9E'],
  teal: ['#0F766E', '#0D9488', '#14B8A6', '#115E59', '#2DD4BF'],
  coral: ['#E11D48', '#F43F5E', '#BE123C', '#FB7185', '#EA580C'],
  gold: ['#D97706', '#F59E0B', '#B45309', '#FBBF24'],
  magenta: ['#A21CAF', '#C026D3', '#86198F', '#DB2777', '#E879F9'],
  green: ['#15803D', '#16A34A', '#166534', '#22C55E', '#4ADE80'],
};

export const CARD_HUE_FAMILIES = Object.keys(HUE_STOPS) as CardHueFamily[];

/**
 * Weighted hue buckets, identical to mobile `HueBuckets`. Purple keeps the largest share
 * (5/16 ≈ 31%) as the brand anchor while every other family still appears often.
 */
const HUE_BUCKETS: CardHueFamily[] = [
  'purple',
  'purple',
  'purple',
  'purple',
  'purple',
  'blue',
  'blue',
  'blue',
  'teal',
  'teal',
  'coral',
  'coral',
  'magenta',
  'magenta',
  'gold',
  'green',
];

const PATTERNS: CardPattern[] = ['dots', 'diagonals', 'grain', 'grid', 'chevron'];

/** WCAG 2.1 AA minimum for body text. */
export const WCAG_BODY_TEXT_MIN_RATIO = 4.5;

const SCRIM_ALPHA_FLOOR = 0.28;
const SCRIM_ALPHA_CEILING = 0.82;
const SCRIM_ALPHA_STEP = 0.02;

export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function parseHexRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  ];
}

/** WCAG relative luminance of an sRGB channel triple. */
function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two opaque colors: 1.0 identical, 21.0 black on white. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHexRgb(a));
  const lb = relativeLuminance(parseHexRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composites a black scrim at `alpha` over `base`, matching how the browser blends it. */
function compositeBlackOver(alpha: number, base: string): [number, number, number] {
  const [r, g, b] = parseHexRgb(base);
  const keep = 1 - alpha;
  return [r * keep, g * keep, b * keep];
}

/**
 * Smallest scrim alpha keeping white text readable over every gradient stop. Bright hues (gold,
 * coral) need a heavier scrim than deep purple, so this searches instead of guessing.
 */
export function scrimAlphaForContrast(
  backgrounds: string[],
  minRatio: number = WCAG_BODY_TEXT_MIN_RATIO,
): number {
  if (backgrounds.length === 0) return SCRIM_ALPHA_FLOOR;
  const whiteLuminance = 1;
  for (let alpha = SCRIM_ALPHA_FLOOR; alpha < SCRIM_ALPHA_CEILING; alpha += SCRIM_ALPHA_STEP) {
    const readable = backgrounds.every((base) => {
      const scrimmed = relativeLuminance(compositeBlackOver(alpha, base));
      return (whiteLuminance + 0.05) / (scrimmed + 0.05) >= minRatio;
    });
    if (readable) return Math.round(alpha * 100) / 100;
  }
  return SCRIM_ALPHA_CEILING;
}

export function generateCardVisual(
  id: string,
  pinShape: BeaconPinShape = 'rounded_square',
): CardVisual {
  const seed = id || 'click';
  const hash = fnv1a32(seed) >>> 0;
  const hueFamily = HUE_BUCKETS[hash % HUE_BUCKETS.length]!;
  const primary = HUE_STOPS[hueFamily];
  const otherFamilies = CARD_HUE_FAMILIES.filter((family) => family !== hueFamily);
  const secondaryFamily = otherFamilies[Math.floor(hash / 16) % otherFamilies.length]!;
  const secondary = HUE_STOPS[secondaryFamily];
  const stopA = primary[Math.floor(hash / 8) % primary.length]!;
  const stopB = primary[Math.floor(hash / 64) % primary.length]!;
  const stopC = secondary[Math.floor(hash / 512) % secondary.length]!;
  const gradient = Array.from(new Set([stopA, stopB, stopC]));
  const pattern = PATTERNS[Math.floor(hash / 7) % PATTERNS.length]!;
  const scrimAlpha = scrimAlphaForContrast(gradient);
  return {
    id: seed,
    hash: hash | 0,
    gradient,
    pattern,
    hueFamily,
    purpleDominant: hueFamily === 'purple',
    scrimAlpha,
    contentScrim: `rgba(0,0,0,${scrimAlpha})`,
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

/**
 * UI chrome accent for a stable id. Stays 5/8 purple (62.5%) — the 60/40–65/35 product ratio.
 * Do not fold this into the content palette above.
 */
export function accentColorForStableId(id: string): string {
  const hash = fnv1a32(id || 'click') >>> 0;
  return hash % 8 < 5 ? CLICK_PURPLE : CLICK_BLUE;
}
