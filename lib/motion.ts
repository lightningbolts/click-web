export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Opacity-only presence. Duration is 0 when the user prefers reduced motion. */
export function fadeTransition(duration = 0.2) {
  return {
    duration: prefersReducedMotion() ? 0 : duration,
    ease: [0.22, 1, 0.36, 1] as const,
  };
}

export const fadePresence = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
