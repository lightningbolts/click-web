'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;
type Decode = (video: HTMLVideoElement) => Promise<string[]>;

export type QrScannerStatus = 'starting' | 'scanning' | 'denied';

function detectorCtor(): DetectorCtor | null {
  return (window as Window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

/** Any browser with a camera API can scan: natively where it decodes QR, else with jsQR. */
export function canScanCodes(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** The browser's own QR decoder, else jsQR (loaded on first use) over a downscaled frame. */
async function decoder(): Promise<Decode> {
  const Ctor = detectorCtor();
  if (Ctor) {
    const detector = new Ctor({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video)).map((c) => c.rawValue);
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return [];
    // 640 on the long side is plenty for a QR filling the frame, and keeps a frame well under 16 ms.
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, {
      inversionAttempts: 'dontInvert',
    });
    return code ? [code.data] : [];
  };
}

/**
 * The rear camera into `videoRef` while `active`, reporting each QR it reads to `onCode` (every
 * frame it's in view; callers debounce). Stops the camera when inactive or unmounted.
 */
export function useQrScanner(active: boolean, onCode: (raw: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<QrScannerStatus>('starting');
  const report = useEffectEvent(onCode);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    void (async () => {
      try {
        const [media, decode] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
          decoder(),
        ]);
        const video = videoRef.current;
        if (stopped || !video) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        video.srcObject = media;
        await video.play();
        setStatus('scanning');
        // ~10 reads a second: instant to a person, and leaves the main thread free.
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            try {
              for (const raw of await decode(video)) report(raw);
            } catch {
              /* a frame that couldn't be read */
            }
          }
          if (!stopped) timer = window.setTimeout(() => void tick(), 100);
        };
        void tick();
      } catch {
        if (!stopped) setStatus('denied');
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setStatus('starting');
    };
  }, [active]);

  return { videoRef, status };
}
