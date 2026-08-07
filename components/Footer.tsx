'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import ClickLogo from '@/components/ClickLogo';

export default function Footer() {
  const { user } = useAuth();

  if (user) return null;

  return (
    <footer
      className="relative z-50 border-t-2 border-border-hard bg-surface px-6 py-12 text-on-surface md:px-12"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
            <ClickLogo size={36} className="h-9 w-9 md:h-10 md:w-10" />
            <span>
              <span className="text-primary">C</span>
              <span className="text-on-surface">lick</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm font-semibold md:gap-6 md:text-base">
            <Link href="/privacy" className="text-on-surface hover:text-primary">
              Privacy
            </Link>
            <span className="text-outline">•</span>
            <Link href="/terms" className="text-on-surface hover:text-primary">
              Terms
            </Link>
            <span className="text-outline">•</span>
            <Link href="/about" className="text-on-surface hover:text-primary">
              About
            </Link>
            <span className="text-outline">•</span>
            <Link href="/enterprise" className="text-on-surface hover:text-primary">
              Enterprise
            </Link>
          </div>
        </div>
        <div className="space-y-2 text-center text-xs font-medium text-on-surface-variant md:text-sm">
          <p>Made at UW</p>
          <p>© 2025 Click. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
