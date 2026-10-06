'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import ClickLogo from '@/components/ClickLogo';
import { useProductChrome } from '@/lib/shell/ProductChromeContext';
import { PAGE_COLUMN_CLASS } from '@/lib/shell/pageColumn';

export default function Footer() {
  const { user } = useAuth();
  const productChrome = useProductChrome();

  if (user || productChrome) return null;

  return (
    <footer
      data-site-chrome
      className="relative z-50 border-t border-hairline bg-surface py-12 text-fg"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      <div className={PAGE_COLUMN_CLASS}>
        <div className="mb-8 flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
            <ClickLogo size={36} className="h-9 w-9 md:h-10 md:w-10" />
            <span>
              <span className="text-accent">C</span>
              <span className="text-fg">lick</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold md:gap-6 md:text-base">
            <Link href="/privacy" className="text-fg hover:text-accent">
              Privacy
            </Link>
            <span className="text-fg-tertiary">•</span>
            <Link href="/terms" className="text-fg hover:text-accent">
              Terms
            </Link>
            <span className="text-fg-tertiary">•</span>
            <Link href="/about" className="text-fg hover:text-accent">
              About
            </Link>
            <span className="text-fg-tertiary">•</span>
            <Link href="/enterprise" className="text-fg hover:text-accent">
              Enterprise
            </Link>
          </div>
        </div>
        <div className="space-y-2 text-center text-xs font-medium text-fg-secondary md:text-sm">
          <p>Made at UW</p>
          <p>© 2025 Click. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
