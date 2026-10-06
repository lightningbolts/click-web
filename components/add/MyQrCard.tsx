'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Copy, Download, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Skeleton } from '@/components/ds/Skeleton';
import { toast } from '@/components/ds/Toast';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

type QrToken = { qrPayload: string; connectionUrl: string; clickId: string; expiresAt: number };

/** Refresh this long before the 90 s token expires. */
const REFRESH_LEAD_MS = 5_000;

/** Location only when already granted: opening your QR never triggers a permission prompt. */
async function grantedLocationQuery(): Promise<string> {
  try {
    if (!navigator.permissions || !navigator.geolocation) return '';
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return '';
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { maximumAge: 30_000, timeout: 1_500 });
    });
    if (!pos) return '';
    return `?${new URLSearchParams({ lat: String(pos.coords.latitude), lon: String(pos.coords.longitude) })}`;
  } catch {
    return '';
  }
}

async function fetchQrToken(): Promise<QrToken> {
  const res = await fetch(`/api/qr${await grantedLocationQuery()}`, {
    headers: await getFreshAuthHeaders(),
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.data?.qrPayload) throw new Error('qr');
  return {
    qrPayload: json.data.qrPayload,
    connectionUrl: json.data.connectionUrl,
    clickId: json.data.clickId,
    expiresAt: Number(json.data.expiresAt) || Date.now() + 90_000,
  };
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast.error('Couldn’t copy. Select the text and copy it instead.');
  }
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Your Click QR (spec §7.4): a single-use token that rotates every 90 s, on a white plate in
 * both themes so it always scans.
 */
export function MyQrCard({ userId, name, avatarUrl }: { userId: string; name: string; avatarUrl: string | null }) {
  const plateRef = useRef<HTMLDivElement>(null);
  const qr = useSWR<QrToken>('/api/qr', fetchQrToken, {
    // Re-issue just before the 90 s token expires, so a scan never meets a dead code.
    refreshInterval: (latest) => (latest ? Math.max(1_000, latest.expiresAt - Date.now() - REFRESH_LEAD_MS) : 0),
    revalidateOnFocus: true,
    dedupingInterval: 1_000,
  });
  const token = qr.data ?? null;
  const error = qr.error && !token ? 'Couldn’t make your code. Check your connection.' : '';
  const load = () => void qr.mutate();
  const [now, setNow] = useState(() => Date.now());

  // A display-only clock for the countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const msLeft = token ? token.expiresAt - now : 0;

  const shareUrl = token?.connectionUrl ?? '';

  const share = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} on Click`, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copyText(shareUrl, 'Link');
  };

  const download = () => {
    const svg = plateRef.current?.querySelector('svg');
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const pad = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
      const a = document.createElement('a');
      a.download = `click-${token?.clickId ?? 'qr'}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  };

  return (
    <section aria-labelledby="my-qr-title" className="flex min-w-0 flex-col items-center rounded-xl bg-surface p-5 text-center sm:p-8 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      <Avatar seed={userId} name={name} src={avatarUrl} size={56} />
      <h2 id="my-qr-title" className="type-title-3 mt-3 text-fg">
        {name}
      </h2>

      <div
        ref={plateRef}
        className="mt-6 flex aspect-square w-full max-w-[296px] items-center justify-center rounded-xl bg-white dark:shadow-[inset_0_0_0_1px_var(--hairline)]"
      >
        {token ? (
          <QRCodeSVG
            value={token.qrPayload}
            size={248}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            className="h-auto w-[84%]"
            role="img"
            aria-label={`QR code to Click with ${name}`}
          />
        ) : error ? null : (
          <Skeleton className="aspect-square w-[84%]" rounded="md" shimmer />
        )}
      </div>

      <p className="type-body-strong tabular mt-4 h-6 text-fg-secondary" aria-live="off">
        {token ? `Refreshes in ${formatLeft(msLeft)}` : null}
      </p>
      {error ? (
        <InlineNotice variant="destructive" live className="mt-2 w-full text-left" action={<Button size="sm" variant="plain" onClick={load}>Try again</Button>}>
          {error}
        </InlineNotice>
      ) : null}
      <p className="type-body mt-2 max-w-[36ch] text-fg-secondary">
        Keep this open while the other person scans with their Click app.
      </p>

      <div className="mt-6 flex w-full flex-wrap justify-center gap-2">
        <Button icon={Share2} onClick={() => void share()} disabled={!token}>
          Share link
        </Button>
        <Button variant="secondary" icon={Copy} onClick={() => void copyText(shareUrl, 'Link')} disabled={!token}>
          Copy link
        </Button>
        <Button variant="secondary" icon={Download} onClick={download} disabled={!token}>
          Download PNG
        </Button>
      </div>

      {token?.clickId ? (
        <div className="mt-6 flex items-center gap-2">
          <span className="type-title-3 tabular text-fg">{token.clickId}</span>
          <IconButton icon={Copy} aria-label="Copy your Click ID" size="sm" onClick={() => void copyText(token.clickId, 'Click ID')} />
        </div>
      ) : null}
    </section>
  );
}
