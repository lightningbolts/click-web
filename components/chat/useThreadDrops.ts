'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type { Message } from '@/lib/chat/types';
import { chatDropRevealAtMs } from '@/lib/drops/developState';
import type { DropState } from './MessageBubble';

const MAX_IDS = 100;
const TICK_MS = 30_000;

function isDrop(m: Message): boolean {
  const meta = m.metadata as Record<string, unknown> | null | undefined;
  return m.message_type === 'image' && meta?.disposable_roll === true;
}

async function fetchDeveloped(url: string): Promise<Record<string, string>> {
  const res = await fetch(url, { headers: await getFreshAuthHeaders() });
  if (!res.ok) return {};
  const json = (await res.json().catch(() => ({}))) as { developed?: Record<string, string> };
  return json.developed ?? {};
}

/**
 * Develop state for the Click Drops in a thread: when this viewer developed each one (one batched
 * request), plus a clock that only ticks while a drop is still waiting to become developable.
 */
export function useThreadDrops(messages: Message[]): (message: Message) => DropState | undefined {
  const dropIds = useMemo(
    () => messages.filter(isDrop).map((m) => m.id).filter((id) => !id.startsWith('temp')).slice(-MAX_IDS),
    [messages],
  );
  const key = dropIds.length ? `/api/drops/views?kind=chat&ids=${dropIds.map(encodeURIComponent).join(',')}` : null;
  const { data: fetched } = useSWR(key, fetchDeveloped, { revalidateOnFocus: false });
  const [local, setLocal] = useState<Record<string, string>>({});
  const onDeveloped = useCallback((id: string, at: string) => setLocal((cur) => ({ ...cur, [id]: at })), []);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const waiting = useMemo(
    () =>
      messages.some((m) => {
        if (!isDrop(m)) return false;
        const at = chatDropRevealAtMs(m.metadata);
        return at != null && at > nowMs;
      }),
    [messages, nowMs],
  );
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, [waiting]);

  return useCallback(
    (message: Message) =>
      isDrop(message)
        ? { developedAt: local[message.id] ?? fetched?.[message.id] ?? null, onDeveloped, nowMs }
        : undefined,
    [fetched, local, nowMs, onDeveloped],
  );
}
