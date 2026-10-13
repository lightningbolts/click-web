import type { SyntheticEvent } from 'react';

/**
 * `onLoad` for an image with the `img-reveal` class: it fades in once it has arrived instead of
 * popping in (iOS `ClickMotion.subtleFade`). Set on the element, so it costs no re-render.
 */
export function revealImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = '';
}

/**
 * `ref` for the same image: one already in the browser's cache shows at once, with no fade
 * (`onLoad` only arrives after a decode, a frame or more later).
 */
export function revealIfLoaded(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = '';
}
