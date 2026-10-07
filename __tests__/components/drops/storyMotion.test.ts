import { collapsedOnto, cubeFace, dismissDrag, intersectsViewport } from '@/components/drops/story/storyMotion';

/** Parses `translate(dx, dy) scale(s)`. */
function parse(transform: string) {
  const [dx, dy, s] = transform.match(/-?[\d.]+/g)!.map(Number);
  return { dx, dy, s };
}

describe('collapsedOnto', () => {
  const card = { left: 0, top: 0, width: 400, height: 800 };
  const photo = { left: 20, top: 100, width: 360, height: 480 };
  const tile = { left: 30, top: 600, width: 104, height: 140 };

  it('lays the photo over the tile, filling it like the tile does', () => {
    const { dx, dy, s } = parse(collapsedOnto(card, photo, tile).transform);
    expect(s).toBeCloseTo(Math.max(104 / 360, 140 / 480));
    // The photo's center, scaled about the card's center and translated, lands on the tile's.
    expect(200 + (200 - 200) * s + dx).toBeCloseTo(30 + 52);
    expect(400 + (340 - 400) * s + dy).toBeCloseTo(600 + 70);
  });

  it('crops the card to the tile’s shape around the photo, with the tile’s corners', () => {
    const { clipPath, transform } = collapsedOnto(card, photo, tile);
    const { s } = parse(transform);
    const [top, right, bottom, left, radius] = clipPath.match(/-?[\d.]+/g)!.map(Number);
    expect((400 - left - right) * s).toBeCloseTo(104);
    expect((800 - top - bottom) * s).toBeCloseTo(140);
    expect(left + (400 - left - right) / 2).toBeCloseTo(200);
    expect(top + (800 - top - bottom) / 2).toBeCloseTo(340);
    expect(radius * s).toBeCloseTo(16);
  });
});

describe('cubeFace', () => {
  it('rests flat and turns a quarter away about the shared edge', () => {
    expect(cubeFace('out', 1, 0).transform).toBe('translateX(0%) rotateY(0deg)');
    expect(cubeFace('out', 1, 1)).toEqual({ transformOrigin: '100% 50%', transform: 'translateX(-100%) rotateY(-90deg)' });
    expect(cubeFace('in', 1, 0)).toEqual({ transformOrigin: '0% 50%', transform: 'translateX(100%) rotateY(90deg)' });
    expect(cubeFace('in', 1, 1).transform).toBe('translateX(0%) rotateY(0deg)');
    expect(cubeFace('in', -1, 0)).toEqual({ transformOrigin: '100% 50%', transform: 'translateX(-100%) rotateY(-90deg)' });
  });
});

describe('dismissDrag', () => {
  it('follows the finger down, shrinking a little, and lifts the backdrop', () => {
    expect(dismissDrag(-50)).toEqual({ transform: 'translate(0px, 0px) scale(1)', backdrop: 1 });
    expect(dismissDrag(240).backdrop).toBe(0);
    expect(dismissDrag(1000).transform).toBe(`translate(0px, 1000px) scale(${1 - 400 / 2400})`);
  });
});

describe('intersectsViewport', () => {
  it('needs some of the tile on screen', () => {
    expect(intersectsViewport({ left: -200, top: 0, width: 104, height: 140 }, { width: 400, height: 800 })).toBe(false);
    expect(intersectsViewport({ left: 380, top: 0, width: 104, height: 140 }, { width: 400, height: 800 })).toBe(true);
  });
});
