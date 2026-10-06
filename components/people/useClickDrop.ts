'use client';

import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { uploadChatMediaBlob } from '@/lib/chat/chatMediaStorage';
import { computeClickDropRevealTtlIso } from '@/lib/collaboration/clickDropReveal';
import type { CollaborationSessionResponse } from '@/lib/userProfile/profileModalTypes';

export type ClickDropStatus = 'idle' | 'opening' | 'uploading' | 'done' | 'error';

async function jsonHeaders() {
  const headers = new Headers(await getFreshAuthHeaders());
  headers.set('Content-Type', 'application/json');
  return headers;
}

/**
 * Click Drop: a photo dropped into the pair's time-locked shared roll (it develops later for
 * both). Opens a collaboration session, uploads, then posts the roll message.
 */
export function useClickDrop(connectionId: string | null, currentUserId: string | null) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ClickDropStatus>('idle');
  const busy = status === 'opening' || status === 'uploading';

  const pick = useCallback(() => {
    if (!connectionId || !currentUserId || busy) return;
    inputRef.current?.click();
  }, [busy, connectionId, currentUserId]);

  const onFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/') || !connectionId || !currentUserId) {
        setStatus('error');
        return;
      }
      setStatus('opening');
      try {
        const sessionRes = await fetch(
          `/api/connections/${encodeURIComponent(connectionId)}/collaboration-session`,
          { method: 'POST', headers: await jsonHeaders() },
        );
        const session = (await sessionRes.json().catch(() => ({}))) as CollaborationSessionResponse;
        const encounterId = typeof session.encounter_id === 'string' ? session.encounter_id.trim() : '';
        if (!sessionRes.ok || !encounterId) throw new Error('session');
        setStatus('uploading');
        const { publicUrl } = await uploadChatMediaBlob(currentUserId, file, file.type);
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: await jsonHeaders(),
          body: JSON.stringify({
            connectionId,
            content: ' ',
            message_type: 'image',
            metadata: {
              media_url: publicUrl,
              original_mime_type: file.type || 'image/jpeg',
              disposable_roll: true,
              encounter_id: encounterId,
              collaboration_ttl: computeClickDropRevealTtlIso(),
            },
          }),
        });
        if (!res.ok) throw new Error('send');
        setStatus('done');
      } catch {
        setStatus('error');
      }
    },
    [connectionId, currentUserId],
  );

  return { inputRef, status, busy, pick, onFile };
}
