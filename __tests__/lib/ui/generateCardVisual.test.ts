import {
  generateCardVisual,
  accentColorForStableId,
  beaconPinShapeFor,
  contrastRatio,
  CARD_HUE_FAMILIES,
  WCAG_BODY_TEXT_MIN_RATIO,
  type CardHueFamily,
} from '@/lib/ui/generateCardVisual';
import { cardVisualStyle } from '@/lib/ui/cardVisualPattern';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';

/** Black scrim at `alpha` over `hex`, as the browser composites it. */
function compositeBlackOver(alpha: number, hex: string): string {
  const raw = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) * (1 - alpha));
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

describe('generateCardVisual', () => {
  it('is deterministic per id', () => {
    expect(generateCardVisual('event-42')).toEqual(generateCardVisual('event-42'));
  });

  it('keeps purple as the weighted anchor without being the only family', () => {
    let purple = 0;
    for (let i = 0; i < 800; i++) {
      if (generateCardVisual(`id-${i}`).hueFamily === 'purple') purple += 1;
    }
    const ratio = purple / 800;
    expect(ratio).toBeGreaterThanOrEqual(0.25);
    expect(ratio).toBeLessThanOrEqual(0.4);
  });

  it('covers every hue family', () => {
    const seen = new Set<CardHueFamily>();
    for (let i = 0; i < 800; i++) {
      seen.add(generateCardVisual(`id-${i}`).hueFamily);
    }
    expect([...seen].sort()).toEqual([...CARD_HUE_FAMILIES].sort());
  });

  it('keeps white text readable on every gradient stop', () => {
    for (let i = 0; i < 400; i++) {
      const visual = generateCardVisual(`wcag-${i}`);
      for (const stop of visual.gradient) {
        const scrimmed = compositeBlackOver(visual.scrimAlpha, stop);
        expect(contrastRatio('#ffffff', scrimmed)).toBeGreaterThanOrEqual(
          WCAG_BODY_TEXT_MIN_RATIO,
        );
      }
    }
  });

  it('accent slots stay ~62.5% purple', () => {
    let purple = 0;
    for (let i = 0; i < 800; i++) {
      if (accentColorForStableId(`a-${i}`) === '#630ED4') purple += 1;
    }
    const ratio = purple / 800;
    expect(ratio).toBeGreaterThanOrEqual(0.58);
    expect(ratio).toBeLessThanOrEqual(0.68);
  });

  it('maps beacon types to distinct shapes', () => {
    expect(beaconPinShapeFor('soundtrack')).toBe('circle');
    expect(beaconPinShapeFor('hazard')).toBe('triangle');
    expect(beaconPinShapeFor('sos')).toBe('diamond');
    expect(beaconPinShapeFor('utility')).toBe('hexagon');
  });
});

describe('cardVisualStyle', () => {
  it('layers the pattern above the gradient', () => {
    const visual = generateCardVisual('pattern-check');
    const style = cardVisualStyle(visual);
    const image = String(style.backgroundImage);
    expect(image).toContain('linear-gradient(135deg');
    // Pattern layer comes first so it paints on top of the gradient.
    expect(image.indexOf('linear-gradient(135deg')).toBeGreaterThan(0);
    expect(style.color).toBe(visual.onContent);
  });
});

describe('beaconHeroImageUrl', () => {
  it('prefers album art then uploaded image_url', () => {
    expect(
      beaconHeroImageUrl({
        album_art_url: 'https://cdn.example/art.jpg',
        image_url: 'https://cdn.example/upload.jpg',
      }),
    ).toBe('https://cdn.example/art.jpg');
    expect(beaconHeroImageUrl({ image_url: 'https://cdn.example/upload.jpg' })).toBe(
      'https://cdn.example/upload.jpg',
    );
    expect(beaconHeroImageUrl({})).toBeNull();
  });
});
