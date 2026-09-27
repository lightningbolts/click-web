export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Confident arrivals. Duration is 0 when the user prefers reduced motion. */
export function fadeTransition(duration = 0.2) {
  return {
    duration: prefersReducedMotion() ? 0 : duration,
    ease: [0.16, 1, 0.3, 1] as const,
  };
}

export const fadePresence = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Dialog plate. Opacity + transform only: both stay on the compositor, whereas animating
 * clip-path repainted the scrolling plate every frame and flickered (notably in Safari).
 */
export const platePresence = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 4 },
};
