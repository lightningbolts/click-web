import { CircleCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Skeleton } from '@/components/ds/Skeleton';
import { cn } from '@/lib/cn';

/**
 * The white QR tile a host scans (spec 06 §1). `dimmed` fades the code under a check once you're
 * in; tickets keep full contrast so the door can re-scan them.
 */
export function PassQrPlate({ url, label, dimmed = false }: { url: string | null; label: string; dimmed?: boolean }) {
  return (
    <div
      data-testid={url ? 'pass-qr' : undefined}
      className="relative aspect-square w-full max-w-[260px] rounded-[20px] bg-white p-4 dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
    >
      {url ? (
        <QRCodeSVG
          value={url}
          size={228}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
          className={cn('size-full transition-opacity duration-[var(--d-slow)]', dimmed && 'opacity-35')}
          role="img"
          aria-label={label}
        />
      ) : (
        <Skeleton className="size-full" rounded="md" shimmer />
      )}
      {dimmed ? (
        <span className="ds-scale-in absolute inset-0 flex items-center justify-center">
          <CircleCheck size={72} strokeWidth={2} aria-hidden className="fill-online text-white drop-shadow" />
        </span>
      ) : null}
    </div>
  );
}
