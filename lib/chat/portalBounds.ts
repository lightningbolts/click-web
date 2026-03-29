/**
 * Clamp a horizontal center so an element of width `2 * halfWidth` fits inside
 * viewport ∩ optional container. Use with `left: center - halfWidth` (no translate).
 */
export function clampCenterX(
  centerX: number,
  halfWidth: number,
  viewportPad: number,
  container: DOMRect | null,
  containerPad: number,
): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : centerX;
  let minX = viewportPad + halfWidth;
  let maxX = vw - viewportPad - halfWidth;
  if (container) {
    minX = Math.max(minX, container.left + containerPad + halfWidth);
    maxX = Math.min(maxX, container.right - containerPad - halfWidth);
  }
  if (minX <= maxX) {
    return Math.max(minX, Math.min(centerX, maxX));
  }
  if (container) {
    const mid = (container.left + container.right) / 2;
    return Math.max(viewportPad + halfWidth, Math.min(mid, vw - viewportPad - halfWidth));
  }
  return Math.max(viewportPad + halfWidth, Math.min(centerX, vw - viewportPad - halfWidth));
}

/**
 * Clamp a top coordinate for a fixed element of height `height` inside viewport ∩ container.
 */
export function clampTop(
  top: number,
  height: number,
  viewportPad: number,
  container: DOMRect | null,
  containerPad: number,
): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : top + height;
  let minY = viewportPad;
  let maxY = vh - height - viewportPad;
  if (container) {
    minY = Math.max(minY, container.top + containerPad);
    maxY = Math.min(maxY, container.bottom - height - containerPad);
  }
  if (minY <= maxY) {
    return Math.max(minY, Math.min(top, maxY));
  }
  if (container) {
    const innerTop = container.top + containerPad;
    const innerBottom = container.bottom - containerPad - height;
    if (innerBottom >= innerTop) {
      return Math.max(innerTop, Math.min(top, innerBottom));
    }
    return innerTop;
  }
  return Math.max(viewportPad, Math.min(top, vh - height - viewportPad));
}

/**
 * Pin a bar of width `barW` to the start (left edge of bubble) or end (right edge of bubble)
 * of a bubble, then clamp so the bar stays inside viewport ∩ container.
 */
export function clampBarLeftToBubble(
  bubbleLeft: number,
  bubbleRight: number,
  barW: number,
  pin: 'start' | 'end',
  viewportPad: number,
  container: DOMRect | null,
  containerPad: number,
): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : bubbleRight;
  const preferred = pin === 'end' ? bubbleRight - barW : bubbleLeft;
  let minL = viewportPad;
  let maxL = vw - barW - viewportPad;
  if (container) {
    minL = Math.max(minL, container.left + containerPad);
    maxL = Math.min(maxL, container.right - containerPad - barW);
  }
  if (minL <= maxL) {
    return Math.max(minL, Math.min(preferred, maxL));
  }
  if (container) {
    const innerLeft = container.left + containerPad;
    const innerRight = container.right - containerPad - barW;
    if (innerRight >= innerLeft) {
      return Math.max(innerLeft, Math.min(preferred, innerRight));
    }
    return innerLeft;
  }
  return Math.max(viewportPad, Math.min(preferred, vw - barW - viewportPad));
}

/** Clamp a `position:fixed` left edge (element width `barW`) into viewport ∩ container. */
export function clampLeftEdge(
  preferredLeft: number,
  barW: number,
  viewportPad: number,
  container: DOMRect | null,
  containerPad: number,
): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : preferredLeft + barW;
  let minL = viewportPad;
  let maxL = vw - barW - viewportPad;
  if (container) {
    minL = Math.max(minL, container.left + containerPad);
    maxL = Math.min(maxL, container.right - containerPad - barW);
  }
  if (minL <= maxL) {
    return Math.max(minL, Math.min(preferredLeft, maxL));
  }
  if (container) {
    const innerRight = container.right - containerPad;
    const innerLeft = container.left + containerPad;
    const maxLeft = innerRight - barW;
    if (maxLeft >= innerLeft) {
      return Math.max(innerLeft, Math.min(preferredLeft, maxLeft));
    }
    return innerLeft;
  }
  return Math.max(viewportPad, Math.min(preferredLeft, vw - barW - viewportPad));
}

const OVERLAP_EPS = 1;

/**
 * Own-message action bar: prefer just left of the bubble; if clamping would push the bar
 * onto the bubble or out of alignment, fall back to above/below with the bar aligned to
 * the bubble’s right edge (same visual column as the message).
 */
export function placeMineMessageActionBar(
  bubbleRect: DOMRect,
  barW: number,
  barH: number,
  gap: number,
  viewportPad: number,
  boundsRect: DOMRect | null,
  containerPad: number,
): { left: number; top: number } {
  const idealLeft = bubbleRect.left - barW - gap;
  const clampedLeft = clampLeftEdge(idealLeft, barW, viewportPad, boundsRect, containerPad);
  const clearsBubbleLeft =
    clampedLeft + barW <= bubbleRect.left - gap + OVERLAP_EPS;

  if (clearsBubbleLeft) {
    const top = clampTop(
      bubbleRect.top + bubbleRect.height / 2 - barH / 2,
      barH,
      viewportPad,
      boundsRect,
      containerPad,
    );
    return { left: clampedLeft, top };
  }

  let left = clampBarLeftToBubble(
    bubbleRect.left,
    bubbleRect.right,
    barW,
    'end',
    viewportPad,
    boundsRect,
    containerPad,
  );

  const boundsTop = boundsRect ? boundsRect.top + containerPad : viewportPad;
  let top = bubbleRect.top - barH - gap;
  if (top < boundsTop) {
    top = bubbleRect.bottom + gap;
  }
  top = clampTop(top, barH, viewportPad, boundsRect, containerPad);

  return { left, top };
}

/**
 * Other person's message action bar: prefer just to the right of the bubble (inward toward chat
 * center) so it doesn't stack over adjacent messages. Falls back like own messages if there's no room.
 */
export function placeTheirMessageActionBar(
  bubbleRect: DOMRect,
  barW: number,
  barH: number,
  gap: number,
  viewportPad: number,
  boundsRect: DOMRect | null,
  containerPad: number,
): { left: number; top: number } {
  const idealLeft = bubbleRect.right + gap;
  const clampedLeft = clampLeftEdge(idealLeft, barW, viewportPad, boundsRect, containerPad);
  const clearsBubbleRight = clampedLeft >= bubbleRect.right + gap - OVERLAP_EPS;

  if (clearsBubbleRight) {
    const top = clampTop(
      bubbleRect.top + bubbleRect.height / 2 - barH / 2,
      barH,
      viewportPad,
      boundsRect,
      containerPad,
    );
    return { left: clampedLeft, top };
  }

  let left = clampBarLeftToBubble(
    bubbleRect.left,
    bubbleRect.right,
    barW,
    'end',
    viewportPad,
    boundsRect,
    containerPad,
  );

  const boundsTop = boundsRect ? boundsRect.top + containerPad : viewportPad;
  let top = bubbleRect.top - barH - gap;
  if (top < boundsTop) {
    top = bubbleRect.bottom + gap;
  }
  top = clampTop(top, barH, viewportPad, boundsRect, containerPad);

  return { left, top };
}
