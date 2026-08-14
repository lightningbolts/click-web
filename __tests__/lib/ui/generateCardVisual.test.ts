import { generateCardVisual, accentColorForStableId, beaconPinShapeFor } from '@/lib/ui/generateCardVisual';

describe('generateCardVisual', () => {
  it('is deterministic per id', () => {
    expect(generateCardVisual('event-42')).toEqual(generateCardVisual('event-42'));
  });

  it('keeps purple-dominant ratio in band', () => {
    let purple = 0;
    for (let i = 0; i < 800; i++) {
      if (generateCardVisual(`id-${i}`).purpleDominant) purple += 1;
    }
    const ratio = purple / 800;
    expect(ratio).toBeGreaterThanOrEqual(0.58);
    expect(ratio).toBeLessThanOrEqual(0.68);
  });

  it('accent slots stay ~62.5% purple', () => {
    let purple = 0;
    for (let i = 0; i < 800; i++) {
      if (accentColorForStableId(`a-${i}`) === '#630ED4') purple += 1;
    }
    const ratio = purple / 800;
    expect(ratio).toBeGreaterThanOrEqual(0.58);
    expect(ratio).toBeLessThanOrEqual(0.68);
  });

  it('maps beacon types to distinct shapes', () => {
    expect(beaconPinShapeFor('soundtrack')).toBe('circle');
    expect(beaconPinShapeFor('hazard')).toBe('triangle');
    expect(beaconPinShapeFor('sos')).toBe('diamond');
    expect(beaconPinShapeFor('utility')).toBe('hexagon');
  });
});
