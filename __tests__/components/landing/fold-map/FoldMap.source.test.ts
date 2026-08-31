import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '../../../..', rel), 'utf8');
}

describe('FoldMap camera', () => {
  it('frames heatmap bounds in the Map constructor so the first tiles are not a closer zoom', () => {
    const src = read('components/landing/fold-map/FoldMap.tsx');
    expect(src).toContain('bounds');
    expect(src).toContain('fitBoundsOptions');
    expect(src).toContain('foldMapCameraBounds');
    expect(src).toContain('duration: 0');
    expect(src).not.toMatch(/fittedRef/);
    expect(src).not.toMatch(/if \(!fittedRef\.current && cells\.length > 0\)/);
  });
});
