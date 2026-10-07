'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { revealImage } from '@/lib/ui/revealImage';

/** Develop layers over the caller's 12-block preview, coarsest first (iOS `ClickDropDevelopingImage`). */
const BLOOM_BLOCKS = [24, 48, 96] as const;
/** Each finer layer starts blooming this long after the one before; the photo comes last. */
const STAGGER_MS = 140;

/** The photo redrawn `blocks` across its longest side, shown with hard pixel edges. */
function PixelLayer({ image, blocks }: { image: HTMLImageElement; blocks: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Drawn before paint, so a layer is never blank when its bloom starts.
  useLayoutEffect(() => {
    const canvas = ref.current;
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    if (!canvas || !longest) return;
    canvas.width = Math.max(1, Math.round((image.naturalWidth / longest) * blocks));
    canvas.height = Math.max(1, Math.round((image.naturalHeight / longest) * blocks));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  }, [image, blocks]);
  return <canvas ref={ref} aria-hidden className="size-full object-cover [image-rendering:pixelated]" />;
}

/**
 * A developed Click Drop photo, filling its (relative) parent. With `plays` (developed on this
 * screen just now) it resolves out of its pixels like iOS: finer layers bloom out from the center,
 * the photo last, once it has fully decoded. Otherwise, or with Reduce Motion, it fades in as it
 * loads. Callers keep their pixelated preview underneath until the photo covers it.
 */
export function DropDevelopImage({ src, alt, plays }: { src: string; alt: string; plays: boolean }) {
  const bloom = plays && !prefersReducedMotion();
  const [decoded, setDecoded] = useState<{ src: string; image: HTMLImageElement | null } | null>(null);

  useEffect(() => {
    if (!bloom) return;
    let cancelled = false;
    const image = new Image();
    image.src = src;
    void image
      .decode()
      .then(
        () => image,
        () => null,
      )
      .then((result) => {
        if (!cancelled) setDecoded({ src, image: result });
      });
    return () => {
      cancelled = true;
    };
  }, [bloom, src]);

  const layers = bloom && decoded?.src === src ? decoded.image : null;
  // Still decoding: the caller's preview holds until the bloom can run start to finish.
  if (bloom && decoded?.src !== src) return null;

  if (!layers) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- decrypted object URLs and signed originals
      <img src={src} alt={alt} onLoad={revealImage} className="img-reveal absolute inset-0 size-full object-cover" />
    );
  }

  return (
    <>
      {BLOOM_BLOCKS.map((blocks, i) => (
        <div key={blocks} className="drop-bloom-layer absolute inset-0" style={{ animationDelay: `${i * STAGGER_MS}ms` }}>
          <PixelLayer image={layers} blocks={blocks} />
        </div>
      ))}
      <div className="drop-bloom-layer absolute inset-0" style={{ animationDelay: `${BLOOM_BLOCKS.length * STAGGER_MS}ms` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- decrypted object URLs and signed originals */}
        <img src={src} alt={alt} className="size-full object-cover" />
      </div>
    </>
  );
}
