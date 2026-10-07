'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Sheet } from '@/components/ds/Sheet';
import { useQrScanner } from '@/lib/ui/useQrScanner';

export { canScanCodes } from '@/lib/ui/useQrScanner';

/** A Click link on this site, as an in-app path; anything else is ignored. */
export function clickPathFromScan(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    if (!/^\/(c|connect|e|p)\/[^/]+/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function ScanCodeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [notClick, setNotClick] = useState(false);
  const { videoRef, status } = useQrScanner(open, (raw) => {
    const path = clickPathFromScan(raw, window.location.origin);
    if (!path) {
      setNotClick(true);
      return;
    }
    onOpenChange(false);
    router.push(path);
  });
  const error =
    status === 'denied'
      ? 'Click needs camera access to scan. Allow it in your browser settings.'
      : notClick
        ? 'That isn’t a Click code.'
        : '';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setNotClick(false);
        onOpenChange(next);
      }}
      title="Scan a code"
      description="Point your camera at a Click QR code."
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="Camera preview" />
        <span aria-hidden className="pointer-events-none absolute inset-[18%] rounded-xl shadow-[0_0_0_2px_white]" />
      </div>
      {error ? (
        <InlineNotice variant="warning" live className="mt-3">
          {error}
        </InlineNotice>
      ) : null}
    </Sheet>
  );
}
