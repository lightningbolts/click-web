import type { CSSProperties } from 'react';
import type { CardPattern, CardVisual } from '@/lib/ui/generateCardVisual';

/**
 * CSS equivalents of mobile's `DrawScope.drawCardPattern`. Web computed `pattern` but never drew it,
 * so the same beacon looked flatter here than on mobile; these keep the two generators honest.
 *
 * Each entry is a `background-image` / `background-size` pair layered above the gradient.
 */
type PatternLayer = { backgroundImage: string; backgroundSize: string };

const PATTERN_LAYERS: Record<CardPattern, (color: string) => PatternLayer> = {
  dots: (color) => ({
    backgroundImage: `radial-gradient(${color} 1.6px, transparent 1.6px)`,
    backgroundSize: '14px 14px',
  }),
  diagonals: (color) => ({
    backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 1.2px, transparent 1.2px 12px)`,
    backgroundSize: 'auto',
  }),
  grain: (color) => ({
    backgroundImage: `radial-gradient(${color} 0.8px, transparent 0.8px), radial-gradient(${color} 0.8px, transparent 0.8px)`,
    backgroundSize: '5px 5px, 5px 5px',
  }),
  grid: (color) => ({
    backgroundImage: `linear-gradient(to right, ${color} 0 1px, transparent 1px 100%), linear-gradient(to bottom, ${color} 0 1px, transparent 1px 100%)`,
    backgroundSize: '16px 16px, 16px 16px',
  }),
  chevron: (color) => ({
    backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1.4px, transparent 1.4px 18px), repeating-linear-gradient(45deg, ${color} 0 1.4px, transparent 1.4px 18px)`,
    backgroundSize: 'auto',
  }),
};

/** Matches mobile's `Color.White.copy(alpha = 0.14f)` pattern ink. */
export const CARD_PATTERN_INK = 'rgba(255,255,255,0.14)';

export function cardPatternLayer(
  pattern: CardPattern,
  color: string = CARD_PATTERN_INK,
): PatternLayer {
  return PATTERN_LAYERS[pattern](color);
}

/**
 * Inline style for a card surface: the deterministic gradient with its pattern layered on top.
 *
 * Every web surface that paints a generated identity — beacon popups, profile beacon rows, time
 * capsule chapters, avatar fallbacks — should go through this so nothing drifts from mobile.
 */
export function cardVisualStyle(visual: CardVisual): CSSProperties {
  const layer = cardPatternLayer(visual.pattern);
  const gradient = `linear-gradient(135deg, ${visual.gradient.join(', ')})`;
  return {
    backgroundImage: `${layer.backgroundImage}, ${gradient}`,
    backgroundSize: `${layer.backgroundSize}, cover`,
    color: visual.onContent,
  };
}

/** Same as [cardVisualStyle] but as a raw `style="..."` string for imperative popup HTML. */
export function cardVisualStyleCss(visual: CardVisual): string {
  const layer = cardPatternLayer(visual.pattern);
  const gradient = `linear-gradient(135deg, ${visual.gradient.join(', ')})`;
  return [
    `background-image:${layer.backgroundImage}, ${gradient}`,
    `background-size:${layer.backgroundSize}, cover`,
    `color:${visual.onContent}`,
  ].join(';');
}
