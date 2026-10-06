'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Sheet } from '@/components/ds/Sheet';

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function detectorCtor(): DetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

/** Scanning ships only where the browser can decode QR codes itself (Safari can't). */
export function canScanCodes(): boolean {
  return detectorCtor() !== null;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ['qr_code'] });

    const tick = async () => {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          for (const c of codes) {
            const path = clickPathFromScan(c.rawValue, window.location.origin);
            if (path) {
              stopped = true;
              onOpenChange(false);
              router.push(path);
              return;
            }
          }
          if (codes.length) setError('That isn’t a Click code.');
        } catch {
          /* a frame that couldn't be read */
        }
      }
      raf = window.requestAnimationFrame(() => void tick());
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        void tick();
      } catch {
        setError('Click needs camera access to scan. Allow it in your browser settings.');
      }
    })();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onOpenChange, router]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setError('');
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
