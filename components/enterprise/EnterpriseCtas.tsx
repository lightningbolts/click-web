'use client';

import { useState } from 'react';
import WaitlistModal from '@/components/marketing/WaitlistModal';

export default function EnterpriseCtas() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <a
        href="mailto:mepsht@uw.edu?subject=Click%20for%20venues"
        className="fc-btn-primary inline-flex w-full items-center justify-center px-8 py-4 text-base font-bold sm:w-auto"
      >
        Talk to us
      </a>
      <button
        type="button"
        data-testid="enterprise-waitlist"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-[8px] border border-border-hard bg-surface px-8 py-4 text-base font-semibold text-on-surface hover:bg-surface-container sm:w-auto"
      >
        Join the waitlist
      </button>
      <WaitlistModal open={open} onClose={() => setOpen(false)} source="enterprise_landing" />
    </div>
  );
}
