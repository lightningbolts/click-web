import { fadeTransition, platePresence, prefersReducedMotion } from "@/lib/motion";

describe("prefersReducedMotion", () => {
  it("is false when matchMedia reports no preference", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    expect(fadeTransition(0.2).duration).toBe(0.2);
  });

  it("zeros duration when the user prefers reduced motion", () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    expect(fadeTransition(0.2).duration).toBe(0);
  });

  it("animates the dialog plate with compositor-only properties", () => {
    for (const state of [platePresence.initial, platePresence.animate, platePresence.exit]) {
      expect(Object.keys(state).every((k) => ["opacity", "scale", "x", "y"].includes(k))).toBe(true);
    }
    expect(platePresence.animate).toMatchObject({ opacity: 1, scale: 1 });
  });
});
