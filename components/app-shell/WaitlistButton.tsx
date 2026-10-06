'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ds/Button';

const loadWaitlistModal = () => import('@/components/marketing/WaitlistModal');
const WaitlistModal = dynamic(loadWaitlistModal, { ssr: false });

/** "Join the waitlist" (signed-out top bar). The dialog loads on intent. */
export function WaitlistButton({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        className={className}
        onPointerEnter={() => void loadWaitlistModal()}
        onFocus={() => void loadWaitlistModal()}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        Join the waitlist
      </Button>
      {mounted ? <WaitlistModal open={open} onClose={() => setOpen(false)} source="top_bar" /> : null}
    </>
  );
}
