'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { hubRequest } from '@/lib/hub/client';
import type { HubThreadMessage } from '@/lib/hub/hubThread';
import { decryptWebE2eeV2Media, resolveWebHubE2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { decryptMediaBytes, deriveKeysForHub } from '@/lib/chat/crypto';

export default function HubAttachment({ message, participantIds, name }: { message: HubThreadMessage; participantIds: string[]; name: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);
  const objectUrl = useRef('');
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : {};
  const mime = typeof meta.original_mime_type === 'string' ? meta.original_mime_type.toLowerCase() : '';
  const imageMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime);
  const audioMime = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav'].includes(mime);
  const videoMime = ['video/mp4', 'video/webm', 'video/ogg'].includes(mime);
  const revealAt = Date.parse(String(meta.reveal_at ?? meta.collaboration_ttl ?? ''));
  const waitingForReveal = meta.disposable_roll === true && (!Number.isFinite(revealAt) || now < revealAt);
  useEffect(() => {
    if (!waitingForReveal || !Number.isFinite(revealAt)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, revealAt - Date.now()), 2_147_483_647));
    return () => clearTimeout(timer);
  }, [waitingForReveal, revealAt, now]);
  async function load() {
    if (waitingForReveal) return;
    setBusy(true); setError('');
    let session: Awaited<ReturnType<typeof resolveWebHubE2eeV2Session>> = null;
    try {
      const path = meta.media_path ?? meta.mediaPath;
      if (typeof path !== 'string') throw new Error('This older attachment is available in the mobile app.');
      const signed = await hubRequest<{ url: string | null }>(`/api/hub/media?hub_id=${encodeURIComponent(message.hub_id)}&path=${encodeURIComponent(path)}`);
      if (!signed.url) throw new Error('Attachment is temporarily unavailable. Try again.');
      const response = await fetch(signed.url);
      if (!response.ok) throw new Error('Attachment download failed. Try again.');
      const payload = await response.arrayBuffer();
      let bytes: ArrayBuffer | Uint8Array = payload;
      if (message.body.startsWith('e2e2:') || meta.crypto_version === 2) {
        session = await resolveWebHubE2eeV2Session({ hubId: message.hub_id, participantUserIds: participantIds, getAuthHeaders: getFreshAuthHeaders });
        if (!session) throw new Error('Attachment keys are unavailable on this device.');
        const chatId = String(meta.media_chat_id ?? meta.mediaChatId ?? '');
        if (chatId !== message.hub_id) throw new Error('Attachment does not belong to this hub.');
        bytes = await decryptWebE2eeV2Media(session, {
          chatId, epoch: Number(meta.media_epoch ?? meta.mediaEpoch ?? meta.epoch),
          senderDeviceId: String(meta.media_sender_device_id ?? meta.mediaSenderDeviceId ?? meta.sender_device_id ?? ''),
          clientMessageId: String(meta.media_client_message_id ?? meta.mediaClientMessageId ?? meta.client_message_id ?? ''),
          mediaCiphertextSha256: String(meta.media_ciphertext_sha256 ?? meta.mediaCiphertextSha256 ?? ''),
        }, payload);
      } else if (meta.is_encrypted_media === true) {
        const keys = await deriveKeysForHub(message.hub_id);
        try { bytes = await decryptMediaBytes(payload, keys); }
        finally { new Uint8Array(keys.encKeyRaw).fill(0); new Uint8Array(keys.macKeyRaw).fill(0); }
      }
      // Preview only known raster/audio/video types; documents and SVG remain opaque downloads.
      const next = URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageMime || audioMime || videoMime ? mime : 'application/octet-stream' }));
      if (mounted.current) { objectUrl.current = next; setUrl(next); } else URL.revokeObjectURL(next);
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { session?.epochKeys.forEach((key) => key.fill(0)); if (mounted.current) setBusy(false); }
  }
  if (waitingForReveal) return <p className="mt-2 text-sm text-on-surface-variant">{Number.isFinite(revealAt) ? `Photo develops on ${new Date(revealAt).toLocaleString()}` : 'Photo is still developing.'}</p>;
  return <div className="mt-2 text-sm">
    {url ? <a href={url} download={name || 'attachment'} className="font-semibold text-primary underline">Download {name || 'attachment'}</a> : <button type="button" disabled={busy} onClick={() => void load()} className="font-semibold text-primary underline">{busy ? 'Opening attachment…' : 'Open attachment'}</button>}
    {url && imageMime ? <Image src={url} unoptimized width={800} height={600} alt={name || 'Shared image'} className="mt-2 h-auto max-h-80 max-w-full rounded-xl object-contain" /> : null}
    {url && audioMime ? <audio src={url} controls preload="metadata" className="mt-2 max-w-full" aria-label={name || 'Shared audio'} /> : null}
    {url && videoMime ? <video src={url} controls preload="metadata" className="mt-2 max-h-80 max-w-full rounded-xl" aria-label={name || 'Shared video'} /> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
