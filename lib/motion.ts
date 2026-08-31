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

/** Waitlist plate: a desk card opening on the overlay, not a fade-and-rise. */
export const platePresence = {
  initial: { opacity: 0, clipPath: "inset(10% 0 14% 0)" },
  animate: { opacity: 1, clipPath: "inset(0% 0 0% 0)" },
  exit: { opacity: 0, clipPath: "inset(6% 0 10% 0)" },
};
