'use client';

import { useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ds/Button';
import { ClickMark } from '@/components/ds/ClickMark';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { toast } from '@/components/ds/Toast';
import { cn } from '@/lib/cn';

type Anchor = { id: string; name: string; check_in_url: string };
type Paper = 'a4' | 'letter';

const ASPECT: Record<Paper, string> = { a4: 'aspect-[210/297]', letter: 'aspect-[8.5/11]' };

/** Renders an SVG to a 2× PNG and saves it (no extra libraries). */
async function downloadPng(svg: SVGSVGElement, fileName: string, size = 1024) {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  const pad = size * 0.08;
  canvas.width = canvas.height = size + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, size, size);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = fileName;
  a.click();
}

/**
 * Printable check-in poster (spec §9.5): an A4 / Letter white sheet with the Place name and its
 * check-in QR. "Print or save as PDF" uses the browser's print dialog (the page's print styles
 * show only the sheet); "Download PNG" saves the code alone.
 */
export function CheckInPoster({ placeName, anchors, slugBase }: { placeName: string; anchors: Anchor[]; slugBase: string }) {
  const [paper, setPaper] = useState<Paper>('letter');
  const [selected, setSelected] = useState(anchors[0].id);
  const anchor = anchors.find((a) => a.id === selected) ?? anchors[0];
  const qrRef = useRef<SVGSVGElement>(null);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4" data-print-hidden>
        <SegmentedControl<Paper>
          label="Paper size"
          value={paper}
          onChange={setPaper}
          segments={[
            { value: 'letter', label: 'Letter' },
            { value: 'a4', label: 'A4' },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              if (!qrRef.current) return;
              downloadPng(qrRef.current, `${slugBase}-check-in.png`).catch(() => toast.error('Couldn’t make the image. Try printing instead.'));
            }}
          >
            Download PNG
          </Button>
        </div>
        <section aria-labelledby="anchor-list">
          <h2 id="anchor-list" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
            Check-in codes
          </h2>
          <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            {anchors.map((a) => (
              <li key={a.id} className="shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
                <button
                  type="button"
                  aria-pressed={a.id === anchor.id}
                  onClick={() => setSelected(a.id)}
                  className={cn('flex min-h-[52px] w-full flex-col justify-center px-4 text-left hover:bg-hover', a.id === anchor.id && 'bg-selection')}
                >
                  <span className={cn('type-body', a.id === anchor.id ? 'font-semibold text-accent' : 'text-fg')}>{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="type-meta mt-2 px-4 text-fg-tertiary">Each code only works for checking in here. Don’t share it online.</p>
        </section>
      </div>

      <div className="flex justify-center print:block">
        <article
          aria-label={`Poster for ${placeName}`}
          className={cn(
            'flex w-full max-w-[520px] flex-col items-center justify-between rounded-md bg-white p-[8%] text-center text-black shadow-overlay print:max-w-none print:rounded-none print:shadow-none',
            ASPECT[paper],
          )}
          data-poster
        >
          <div className="flex items-center gap-2">
            <ClickMark size={28} />
            <span className="font-display text-xl font-extrabold">Click</span>
          </div>
          <h2 className="font-display text-[clamp(24px,5vw,40px)] font-extrabold leading-tight text-balance">{placeName}</h2>
          <QRCodeSVG ref={qrRef} value={anchor.check_in_url} size={256} level="M" marginSize={0} className="h-auto w-[56%]" title={`Check-in code for ${placeName}`} />
          <div>
            <p className="text-xl font-bold">Scan to check in</p>
            <p className="mt-1 text-sm text-neutral-600">Open your camera, or the Click app, and point it here.</p>
          </div>
        </article>
      </div>
    </div>
  );
}
