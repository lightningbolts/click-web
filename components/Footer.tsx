'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative z-50 px-6 md:px-12 py-12 border-t border-zinc-800 bg-zinc-950">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center gap-6 mb-8">
          <div className="text-2xl md:text-3xl font-bold">
            <span className="text-[#8338EC]">C</span>lick
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-sm md:text-base">
            <Link href="/privacy" className="text-white hover:text-[#8338EC] transition-colors">
              Privacy
            </Link>
            <span className="text-zinc-600">•</span>
            <Link href="/terms" className="text-white hover:text-[#8338EC] transition-colors">
              Terms
            </Link>
            <span className="text-zinc-600">•</span>
            <Link href="/about" className="text-white hover:text-[#8338EC] transition-colors">
              About
            </Link>
          </div>
        </div>
        <div className="text-center text-xs md:text-sm text-zinc-400 space-y-2">
          <p>Made with 💜 at UW</p>
          <p>© 2025 Click. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

