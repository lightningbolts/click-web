'use client';

import { useEffect, useRef, useState } from 'react';
import { Hourglass, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ds/Spinner';
import type { DerivedKeys } from '@/lib/chat/crypto';
import type { E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { mediaV2Fields } from '@/lib/chat/mediaV2Fields';
import { originalMimeTypeFromMetadata } from '@/lib/chat/mediaMetadata';
import type { MessageMediaMetadata } from '@/lib/chat/types';
import type { Message } from '@/lib/chat/types';
import { useSecureMedia } from '@/lib/chat/useSecureMedia';
import { chatDropRevealAtMs, dropDevelopState } from '@/lib/drops/developState';
import { postHomeAction } from '@/lib/home/postHomeAction';
import { chatNotify } from './chatNotify';

/** Block widths of the develop layers (iOS `ClickDropDevelopEffect`), coarsest first. */
const BLOOM_BLOCKS = [12, 24, 48, 96] as const;

type DevelopResponse = {
  drops: ({ id: string; status: 'developed'; developed_at: string; url: string | null } | { id: string; status: 'pending' | 'not_found' })[];
};

/** The image redrawn `blocks` wide and scaled back up with hard edges. */
function PixelLayer({ src, blocks, className }: { src: string; blocks: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = ref.current;
      if (!canvas || !img.naturalWidth) return;
      canvas.width = blocks;
      canvas.height = Math.max(1, Math.round((blocks * img.naturalHeight) / img.naturalWidth));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = src;
  }, [src, blocks]);
  return <canvas ref={ref} aria-hidden className={`absolute inset-0 size-full [image-rendering:pixelated] ${className ?? ''}`} />;
}

function formatLeft(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h ${min % 60}m` : `${Math.ceil(h / 24)}d`;
}

/**
 * A Click Drop in the timeline (spec §7.2): pixelated until it develops, then a pixel-bloom
 * reveal. Gated originals arrive as a signed URL once developed and are decrypted here.
 */
export function ClickDropBubble({
  message,
  previewSrc,
  previewLoading,
  developedAt,
  onDeveloped,
  mediaChatKey,
  getAuthHeaders,
  getE2eeV2Session,
  nowMs,
}: {
  message: Message;
  previewSrc: string | null;
  previewLoading: boolean;
  developedAt: string | null;
  onDeveloped: (id: string, at: string) => void;
  mediaChatKey?: DerivedKeys | ArrayBuffer | null;
  getAuthHeaders?: () => Promise<HeadersInit>;
  getE2eeV2Session?: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  nowMs: number;
}) {
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const revealAt = chatDropRevealAtMs(meta) ?? 0;
  const state = dropDevelopState(revealAt, developedAt, nowMs);
  const [busy, setBusy] = useState(false);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);

  const gated = meta.drop_gated === true;
  const original = useSecureMedia({
    storageUrl: gated ? originalUrl : null,
    storagePath: null,
    chatKey: mediaChatKey,
    mimeType: originalMimeTypeFromMetadata(meta.drop_original as MessageMediaMetadata | null | undefined) ?? originalMimeTypeFromMetadata(meta),
    isEncryptedMedia: gated,
    getE2eeV2Session,
    getAuthHeaders,
    v2Metadata: gated ? mediaV2Fields(meta.drop_original, message.chat_id) : null,
  });
  // Legacy drops carry the original as the message's own media.
  const fullSrc = gated ? original.src : previewSrc;
  const revealed = state === 'developed' && !!fullSrc;

  const develop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await postHomeAction<DevelopResponse>('/api/drops/develop', { drops: [{ kind: 'chat', id: message.id }] });
      const hit = res.drops.find((d) => d.id === message.id);
      if (hit?.status === 'developed') {
        setAnimate(true);
        if (hit.url) setOriginalUrl(hit.url);
        onDeveloped(message.id, hit.developed_at);
      } else if (hit?.status === 'pending') {
        chatNotify({ type: 'error', message: 'Not ready yet. It develops soon.' });
      }
    } catch {
      chatNotify({ type: 'error', message: 'Couldn’t develop it. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  // Already developed elsewhere: fetch the gated original once, without the bloom.
  const needsOriginal = state === 'developed' && gated && !originalUrl && !busy;
  useEffect(() => {
    if (!needsOriginal) return;
    let cancelled = false;
    void postHomeAction<DevelopResponse>('/api/drops/develop', { drops: [{ kind: 'chat', id: message.id }] })
      .then((res) => {
        const hit = res.drops.find((d) => d.id === message.id);
        if (!cancelled && hit?.status === 'developed' && hit.url) setOriginalUrl(hit.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsOriginal, message.id]);

  return (
    <div className="relative h-[min(320px,60vw)] w-[240px] max-w-full overflow-hidden rounded-lg bg-fill-subtle">
      {previewLoading && !previewSrc ? <div className="absolute inset-0 animate-pulse bg-fill-subtle" aria-busy aria-label="Decrypting Click Drop" /> : null}
      {previewSrc ? <PixelLayer src={previewSrc} blocks={BLOOM_BLOCKS[0]} /> : null}

      {revealed && fullSrc ? (
        animate ? (
          <>
            {BLOOM_BLOCKS.slice(1).map((blocks, i) => (
              <div key={blocks} className="drop-bloom-layer absolute inset-0" style={{ animationDelay: `${i * 140}ms` }}>
                <PixelLayer src={fullSrc} blocks={blocks} />
              </div>
            ))}
            <div className="drop-bloom-layer absolute inset-0" style={{ animationDelay: `${3 * 140}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- decrypted object URL */}
              <img src={fullSrc} alt="Click Drop photo" className="size-full object-cover" />
            </div>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- decrypted object URL
          <img src={fullSrc} alt="Click Drop photo" className="absolute inset-0 size-full object-cover" />
        )
      ) : null}

      {!revealed ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {state === 'pending' ? (
            <span className="material-glass-dark type-meta inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-semibold">
              <Hourglass size={14} aria-hidden />
              Click Drop · develops in {formatLeft(revealAt - nowMs)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void develop()}
              disabled={busy || (state === 'developed' && gated)}
              className="press material-glass-dark type-meta inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-semibold"
            >
              {busy || state === 'developed' ? <Spinner size={14} /> : <Sparkles size={14} aria-hidden />}
              {state === 'developed' ? 'Developing…' : 'Tap to develop'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
