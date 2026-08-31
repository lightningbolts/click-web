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

  it("opens the waitlist plate with a clip, not a fade-and-rise", () => {
    expect(platePresence.initial).toMatchObject({ opacity: 0 });
    expect(String(platePresence.initial.clipPath)).toMatch(/inset/);
    expect(platePresence.animate.clipPath).toBe("inset(0% 0 0% 0)");
  });
});
