'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { ClickMark } from '@/components/ds/ClickMark';
import { useProductChrome } from '@/lib/shell/ProductChromeContext';

const LINKS = [
  { href: '/events', label: 'Events' },
  { href: '/enterprise', label: 'For business' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const;

const BUILD_YEAR = Number(process.env.NEXT_PUBLIC_BUILD_YEAR) || new Date().getFullYear();
const noSubscribe = () => () => {};

/**
 * The year now. Prerendered pages carry the build year, so hydration uses that and the
 * browser then swaps in the real one: no mismatch when a page outlives New Year.
 */
function useCurrentYear() {
  return useSyncExternalStore(noSubscribe, () => new Date().getFullYear(), () => BUILD_YEAR);
}

export default function Footer() {
  const { user } = useAuth();
  const productChrome = useProductChrome();
  const year = useCurrentYear();

  if (user || productChrome) return null;

  return (
    <footer data-site-chrome className="relative z-50 border-t border-hairline bg-surface">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <ClickMark size={24} />
          <span className="type-headline text-fg">Click</span>
          <span className="type-meta text-fg-secondary">Made at UW</span>
        </div>
        <nav aria-label="Footer">
          <ul className="type-body flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-fg-secondary hover:text-fg">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="type-meta text-fg-tertiary">© {year} Click</p>
      </div>
    </footer>
  );
}
