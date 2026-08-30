import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
}

describe('anonymous landing JS budget', () => {
  it('does not statically import dashboard, playground, or waitlist chrome', () => {
    const landing = read('components/landing/LandingPage.tsx');
    const navbar = read('components/Navbar.tsx');
    const layout = read('app/layout.tsx');
    const page = read('app/page.tsx');

    expect(landing).not.toMatch(/import HomeAuthenticated from/);
    expect(landing).not.toMatch(/import LandingPlayground from/);
    expect(landing).not.toMatch(/import WaitlistModal from/);
    expect(landing).toContain('next/dynamic');
    expect(landing).toContain('LandingPlaygroundLazy');

    expect(navbar).not.toMatch(/import LoginModal from/);
    expect(navbar).toContain('next/dynamic');

    expect(layout).toContain('preload: false');
    expect(layout).toContain('getServerUser');
    expect(page).toContain('getServerUser');
    expect(page).toContain('basemaps.cartocdn.com');

    const foldMap = read('components/landing/fold-map/FoldMap.tsx');
    expect(foldMap).toContain('cooperativeGestures: true');
  });
});
