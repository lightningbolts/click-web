'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DerivedKeys } from '@/lib/chat/crypto';
import { decryptGroupMediaBytes, decryptMediaBytes } from '@/lib/chat/crypto';

const BASE64_BODY_MARKER = 'base64,';
const BASE64_PAYLOAD_RE = /^[A-Za-z0-9+/=\s]+$/;

export type SecureMediaChatKey = DerivedKeys | ArrayBuffer;

export interface SecureMediaObjectUrlOptions {
  storageUrl: string;
  chatKey: SecureMediaChatKey;
  mimeType?: string;
  signal?: AbortSignal;
}

export interface UseSecureMediaOptions {
  storageUrl?: string | null;
  chatKey?: SecureMediaChatKey | null;
  mimeType?: string | null;
  isEncryptedMedia?: boolean;
}

export interface UseSecureMediaResult {
  src: string | null;
  isLoading: boolean;
  error: Error | null;
}

function isGroupMasterKey(value: SecureMediaChatKey): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function decodeBase64ToBytes(base64: string): Uint8Array | null {
  const compact = base64.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !BASE64_PAYLOAD_RE.test(compact)) return null;

  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeMaybeBase64Payload(rawBytes: Uint8Array): Uint8Array | null {
  const text = new TextDecoder().decode(rawBytes).trim();
  if (!text) return null;

  const markerIndex = text.toLowerCase().indexOf(BASE64_BODY_MARKER);
  if (markerIndex >= 0) {
    return decodeBase64ToBytes(text.slice(markerIndex + BASE64_BODY_MARKER.length).trim());
  }

  return decodeBase64ToBytes(text);
}

async function fetchEncryptedPayload(storageUrl: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(storageUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch media payload: ${response.status}`);
  }
  const payload = new Uint8Array(await response.arrayBuffer());
  if (payload.byteLength === 0) {
    throw new Error('Encrypted media payload was empty');
  }
  return payload;
}

async function decryptPayload(payload: Uint8Array, chatKey: SecureMediaChatKey): Promise<Uint8Array> {
  if (isGroupMasterKey(chatKey)) {
    return decryptGroupMediaBytes(payload, chatKey);
  }
  return decryptMediaBytes(payload, chatKey);
}

export async function createSecureMediaObjectUrl({
  storageUrl,
  chatKey,
  mimeType,
  signal,
}: SecureMediaObjectUrlOptions): Promise<string> {
  const encrypted = await fetchEncryptedPayload(storageUrl, signal);

  let decrypted: Uint8Array;
  try {
    decrypted = await decryptPayload(encrypted, chatKey);
  } catch (primaryError) {
    const fallbackBytes = decodeMaybeBase64Payload(encrypted);
    if (!fallbackBytes) {
      throw primaryError;
    }
    decrypted = await decryptPayload(fallbackBytes, chatKey);
  }

  const decryptedCopy = new Uint8Array(decrypted.byteLength);
  decryptedCopy.set(decrypted);

  const blob = new Blob([decryptedCopy.buffer], {
    type: mimeType && mimeType.trim().length > 0 ? mimeType.trim() : 'application/octet-stream',
  });
  return URL.createObjectURL(blob);
}

export function useSecureMedia({
  storageUrl,
  chatKey,
  mimeType,
  isEncryptedMedia = false,
}: UseSecureMediaOptions): UseSecureMediaResult {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(() => {
    revokeObjectUrl();
    setError(null);

    if (!storageUrl || storageUrl.trim().length === 0) {
      setSrc(null);
      setIsLoading(false);
      return;
    }

    if (!isEncryptedMedia) {
      setSrc(storageUrl);
      setIsLoading(false);
      return;
    }

    if (!chatKey) {
      setSrc(null);
      setIsLoading(false);
      setError(new Error('Missing chat key for encrypted media'));
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setSrc(null);
    setIsLoading(true);

    void createSecureMediaObjectUrl({
      storageUrl,
      chatKey,
      mimeType: mimeType ?? undefined,
      signal: controller.signal,
    })
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrlRef.current = objectUrl;
        setSrc(objectUrl);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error('Failed to decrypt media'));
        setSrc(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      revokeObjectUrl();
    };
  }, [chatKey, isEncryptedMedia, mimeType, revokeObjectUrl, storageUrl]);

  useEffect(() => revokeObjectUrl, [revokeObjectUrl]);

  return { src, isLoading, error };
}
