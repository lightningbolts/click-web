'use client';

/**
 * AttachmentBubble — renders a file-type message whose decrypted body is a `ccx:v1:` envelope.
 *
 * Download flow (opt-in):
 *   1. User taps "Download"
 *   2. Mint a fresh signed URL via `/api/chat/attachments/sign`
 *   3. Fetch ciphertext
 *   4. Derive per-file subkeys from `envelope.key`, verify HMAC, AES-CBC decrypt
 *   5. Compare SHA-256 of plaintext to `envelope.sha256` (integrity check)
 *   6. Trigger a browser download for the original `envelope.name` / MIME
 *
 * Ciphertext never stays in memory or IndexedDB after the save-as completes. We never
 * render the decrypted plaintext inline; the browser's download manager is the only
 * surface the bytes are exposed through.
 */

import { useCallback, useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2, FileDown, FileText, FileArchive, FileImage, FileVideo } from 'lucide-react';
import {
  decodeFileMasterKeyBase64,
  decryptFileBytes,
  sha256Base64,
  type AttachmentEnvelope,
} from '@/lib/chat/attachmentCrypto';
import {
  downloadAttachmentCiphertext,
  signChatAttachmentUrl,
} from '@/lib/chat/chatAttachmentStorage';

interface AttachmentBubbleProps {
  envelope: AttachmentEnvelope;
  isMine: boolean;
  /** Called with fresh `Headers` instance for Authorization; supplied by parent. */
  getAuthHeaders: () => Promise<HeadersInit>;
}

type DownloadState =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'verifying' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function iconForMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (m.includes('zip')) return FileArchive;
  return FileText;
}

function triggerBrowserDownload(bytes: Uint8Array, fileName: string, mime: string): void {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'attachment';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoke on next tick so the browser has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export default function AttachmentBubble({ envelope, isMine, getAuthHeaders }: AttachmentBubbleProps) {
  const [state, setState] = useState<DownloadState>({ kind: 'idle' });
  const Icon = iconForMime(envelope.mime);

  const onDownload = useCallback(async () => {
    if (state.kind === 'downloading' || state.kind === 'verifying') return;
    setState({ kind: 'downloading' });
    try {
      const signed = await signChatAttachmentUrl(envelope.path, getAuthHeaders);
      const cipher = await downloadAttachmentCiphertext(signed);

      setState({ kind: 'verifying' });
      const key = decodeFileMasterKeyBase64(envelope.key);
      const plain = await decryptFileBytes(cipher, key);
      const digest = await sha256Base64(plain);
      if (digest !== envelope.sha256) {
        throw new Error('Attachment integrity check failed (SHA-256 mismatch)');
      }

      triggerBrowserDownload(plain, envelope.name, envelope.mime);
      setState({ kind: 'done' });
    } catch (err) {
      console.error('Attachment download failed:', err);
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }, [envelope, getAuthHeaders, state.kind]);

  const bubbleClass = isMine
    ? 'border-2 border-border-hard bg-primary text-on-primary'
    : 'border-2 border-border-hard bg-surface-container text-on-surface';

  const busy = state.kind === 'downloading' || state.kind === 'verifying';
  const error = state.kind === 'error' ? state.message : null;
  const done = state.kind === 'done';

  return (
    <div
      className={`flex w-[min(100%,22rem)] items-stretch gap-3 rounded-2xl px-3 py-2.5 ${bubbleClass}`}
      role="group"
      aria-label={`Encrypted attachment: ${envelope.name}`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          isMine ? 'bg-black/15 text-on-primary' : 'bg-on-primary-container text-primary'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-sm font-medium leading-tight">{envelope.name}</span>
        <span className={`truncate text-[11px] leading-tight ${isMine ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
          {formatBytes(envelope.size)}
          {envelope.mime ? ` · ${envelope.mime}` : ''}
        </span>
        {error && (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-red-700 dark:text-red-300">
            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
            {error}
          </span>
        )}
        {done && (
          <span className={`mt-0.5 flex items-center gap-1 text-[11px] ${isMine ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400'}`}>
            <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
            Decrypted · integrity verified
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className={`flex shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          busy
            ? 'cursor-wait opacity-70 ' + (isMine ? 'bg-black/15 text-on-primary' : 'bg-surface text-on-surface-variant')
            : isMine
              ? 'bg-black/15 text-on-primary hover:bg-black/25'
              : 'bg-primary/15 text-primary hover:bg-primary/25'
        }`}
        aria-label={`Download ${envelope.name}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}
