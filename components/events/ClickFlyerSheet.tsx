'use client';

import { Check, Copy, Download, Share } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ds/Button';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { Sheet } from '@/components/ds/Sheet';
import { Spinner } from '@/components/ds/Spinner';
import { toast } from '@/components/ds/Toast';
import { flyerPixelSize, renderFlyer, type FlyerArt, type FlyerFormat } from '@/lib/events/flyerCanvas';
import type { FlyerEvent } from '@/lib/events/flyerEvent';
import { supabaseRenderUrl } from '@/lib/images/cfLoader';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';


type Rendered = { url: string; file: File };

const FORMATS = [
  { value: 'story', label: 'Story' },
  { value: 'post', label: 'Post' },
] as const;

/** An empty image with the flyer's shape, so the placeholder sizes exactly like the result. */
function placeholder(format: FlyerFormat): string {
  const { width, height } = flyerPixelSize(format);
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`)}`;
}

/** The event picture, readable by a canvas (CORS), at flyer size; null when it can't be had. */
async function loadPicture(url: string | null): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(supabaseRenderUrl(url, 1400, 85) ?? url, { mode: 'cors' });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/** Manrope as next/font registered it, loaded before drawing so the title isn't in a fallback face. */
async function displayFamily(): Promise<string> {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-manrope').trim() || 'sans-serif';
  await document.fonts?.load(`800 27px ${family}`).catch(() => undefined);
  return family;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('flyer'))), 'image/png'));
}

/**
 * "Create Click Flyer" (spec 06 §8, iOS `ClickFlyerSheet`): the event as an Instagram Story or
 * post image, rendered in the browser; the preview is the exact image that's saved or shared.
 */
export function ClickFlyerSheet({ open, onOpenChange, event }: { open: boolean; onOpenChange: (open: boolean) => void; event: FlyerEvent }) {
  const [format, setFormat] = useState<FlyerFormat>('story');
  const [rendered, setRendered] = useState<Partial<Record<FlyerFormat, Rendered>>>({});
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const art = useRef<Promise<FlyerArt> | null>(null);
  const urls = useRef<string[]>([]);
  const current = rendered[format];
  const canShareFiles =
    current != null && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [current.file] }) === true;

  useEffect(() => {
    if (!open || rendered[format]) return;
    let cancelled = false;
    art.current ??= Promise.all([loadPicture(event.imageUrl), displayFamily()]).then(([picture, family]) => ({
      picture,
      gradient: generateCardVisual(event.seed).gradient,
      qr: qrRef.current as HTMLCanvasElement,
      displayFamily: family,
    }));
    void art.current
      .then(async (a) => {
        const canvas = renderFlyer(format, event, a);
        const blob = await toBlob(canvas);
        if (cancelled) return;
        const file = new File([blob], `click-flyer-${format}.png`, { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setRendered((r) => ({ ...r, [format]: { url, file } }));
      })
      .catch(() => {
        if (!cancelled) toast.error('Couldn’t make the flyer. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, format, rendered, event]);

  // The renders are kept while the page is open (reopening is instant), then released.
  useEffect(() => {
    const made = urls.current;
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(event.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Couldn’t copy the link.');
    }
  };

  const save = () => {
    if (!current) return;
    const a = document.createElement('a');
    a.href = current.url;
    a.download = current.file.name;
    a.click();
  };

  // The flyer alone: Instagram refuses a shared link that isn't its own, and the QR carries it.
  const share = async () => {
    if (!current) return;
    try {
      await navigator.share({ files: [current.file], title: event.title });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast.error('Couldn’t share the flyer.');
    }
  };

  const host = event.link.replace(/^https?:\/\//, '');

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Click Flyer"
      description="A Story or post with a QR to RSVP."
      initialDetent="large"
      footer={
        <div className="grid auto-cols-fr grid-flow-col gap-2.5">
          <Button variant={canShareFiles ? 'secondary' : 'primary'} icon={Download} fullWidth disabled={!current} onClick={save}>
            Save
          </Button>
          {canShareFiles ? (
            <Button variant="primary" icon={Share} fullWidth onClick={() => void share()}>
              Share
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3.5">
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label={copied ? 'Link copied' : 'Copy event link'}
          className="type-meta flex h-10 max-w-full items-center gap-2 rounded-pill bg-fill-subtle px-4 text-fg transition-colors hover:bg-fill-strong"
        >
          <span className="truncate">{host}</span>
          {copied ? (
            <Check size={16} strokeWidth={2.25} aria-hidden className="shrink-0 text-online-text" />
          ) : (
            <Copy size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-secondary" />
          )}
        </button>
        <SegmentedControl segments={FORMATS} value={format} onChange={setFormat} label="Flyer format" fullWidth />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, not a remote image */}
          <img
            src={current?.url ?? placeholder(format)}
            alt={current ? `Flyer for ${event.title}` : ''}
            className="block h-auto max-h-[calc(92dvh-300px)] w-auto max-w-full rounded-[22px] bg-fill-subtle shadow-[0_10px_44px_rgba(0,0,0,0.22)] md:max-h-[calc(100dvh-280px)]"
          />
          {current ? null : (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </span>
          )}
        </div>
      </div>
      <QRCodeCanvas ref={qrRef} value={event.link} size={138} marginSize={0} level="M" className="hidden" aria-hidden />
    </Sheet>
  );
}
