import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
}

describe('anonymous landing JS budget', () => {
  it('does not statically import dashboard, playground, or waitlist chrome', () => {
    const landing = read('components/landing/LandingPage.tsx');
    const chrome = read('components/app-shell/SiteChrome.tsx');
    const waitlist = read('components/app-shell/WaitlistButton.tsx');
    const layout = read('app/layout.tsx');
    const page = read('app/page.tsx');

    expect(landing).not.toMatch(/import HomeAuthenticated from/);
    expect(landing).not.toMatch(/import LandingPlayground from/);
    expect(landing).not.toMatch(/import WaitlistModal from/);
    expect(landing).not.toMatch(/from ['"]framer-motion['"]/);
    expect(landing).toContain('next/dynamic');
    expect(landing).toContain('LandingPlaygroundLazy');

    // Waitlist modal stays out of the anonymous bundle until asked for.
    expect(chrome).not.toMatch(/import WaitlistModal from/);
    expect(waitlist).toMatch(/dynamic\(|import\(/);

    // Root layout stays static: no cookie read, one display font (spec §4.2, §11).
    expect(layout).not.toContain('getServerUser');
    expect(layout).not.toMatch(/Source_Serif|Inter\(/);
    expect(layout).not.toContain('@vercel/analytics');
    expect(page).toContain('getServerUser');
    expect(page).toContain('basemaps.cartocdn.com');

    const foldMap = read('components/landing/fold-map/FoldMap.tsx');
    expect(foldMap).toContain('cooperativeGestures: true');
    expect(foldMap).toContain('fitBoundsOptions');
    expect(foldMap).toContain('foldMapCameraBounds');
  });
});
