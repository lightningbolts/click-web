import type { SyntheticEvent } from 'react';

/**
 * `onLoad` for an image with the `img-reveal` class: it fades in once it has arrived instead of
 * popping in (iOS `ClickMotion.subtleFade`). Set on the element, so it costs no re-render.
 */
export function revealImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.dataset.loaded = '';
}
