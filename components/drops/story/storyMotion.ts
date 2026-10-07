/**
 * Motion for the drop story viewer, mirroring iOS `SharedDropStoryViewer`: the card zooms out of
 * the tapped tile (cropped to the tile's shape around the photo), and people change with a cube
 * turn. Pure geometry, so it can be tested without a browser.
 */

export type Box = { left: number; top: number; width: number; height: number };

/** Quicker than a system zoom, so a drop pops open; a curve rather than a spring so it lands on time. */
export const ZOOM = { duration: 200, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' } as const;
/** The card fades onto its tile in the last moment of the zoom closing (iOS `zoomSettled`, `crossFade`). */
export const ZOOM_SETTLED_MS = 140;
export const CROSS_FADE_MS = 100;
/** The card and tile trade places quickly as the zoom opens (iOS `crossFadeIn`). */
export const CROSS_FADE_IN_MS = 60;
/** The cube finishing a turn or springing back: quick, no overshoot (iOS `.snappy(duration: 0.32)`). */
export const CUBE = { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' } as const;
/** Corner radius of a strip tile, which the collapsed card takes on. */
export const TILE_RADIUS = 16;

/** The card at rest: whole and unclipped. Same function shapes as `collapsedOnto`, so they interpolate. */
export const PRESENTED = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round 0px)' } as const;

/**
 * The transform and crop that lay the card's photo (`photo`) over `tile` exactly as the tile fills
 * it (cover), with the rest of the card cropped away. `card` and `photo` are untransformed
 * viewport rects; the transform origin is the card's center.
 */
export function collapsedOnto(card: Box, photo: Box, tile: Box, radius = TILE_RADIUS): { transform: string; clipPath: string } {
  const scale = Math.max(tile.width / photo.width, tile.height / photo.height);
  const cardCx = card.left + card.width / 2;
  const cardCy = card.top + card.height / 2;
  const photoCx = photo.left + photo.width / 2;
  const photoCy = photo.top + photo.height / 2;
  // Scaled about the card's center, the photo's center lands here; the translate moves it onto the tile's.
  const dx = tile.left + tile.width / 2 - (cardCx + (photoCx - cardCx) * scale);
  const dy = tile.top + tile.height / 2 - (cardCy + (photoCy - cardCy) * scale);
  // The crop, in the card's own (unscaled) space: the tile's size, centered on the photo.
  const w = tile.width / scale;
  const h = tile.height / scale;
  const top = photoCy - card.top - h / 2;
  const left = photoCx - card.left - w / 2;
  const bottom = card.height - top - h;
  const right = card.width - left - w;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
    clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius / scale}px)`,
  };
}

export function intersectsViewport(box: Box, viewport: { width: number; height: number }): boolean {
  return box.width > 0 && box.left < viewport.width && box.top < viewport.height && box.left + box.width > 0 && box.top + box.height > 0;
}

/**
 * One face of the cube turn (Instagram's), `t` from 0 (at rest) to 1 (turned). `step` 1 turns to
 * the next person (their face comes in from the right), -1 to the previous one. The outgoing face
 * swings away about its trailing edge as the incoming one swings in about its leading edge.
 */
export function cubeFace(role: 'out' | 'in', step: 1 | -1, t: number): { transform: string; transformOrigin: string } {
  if (role === 'out') {
    return {
      transformOrigin: step > 0 ? '100% 50%' : '0% 50%',
      transform: `translateX(${-step * 100 * t}%) rotateY(${-step * 90 * t}deg)`,
    };
  }
  return {
    transformOrigin: step > 0 ? '0% 50%' : '100% 50%',
    transform: `translateX(${step * 100 * (1 - t)}%) rotateY(${step * 90 * (1 - t)}deg)`,
  };
}

/** Dragging down to close: the card follows the finger and shrinks a little; the backdrop lifts. */
export function dismissDrag(dy: number): { transform: string; backdrop: number } {
  const y = Math.max(0, dy);
  return { transform: `translate(0px, ${y}px) scale(${1 - Math.min(y, 400) / 2400})`, backdrop: 1 - Math.min(y, 240) / 240 };
}
