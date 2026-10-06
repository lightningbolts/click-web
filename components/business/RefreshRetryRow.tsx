'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RetryRow } from '@/components/ds/RetryRow';

/** A server-rendered module that failed: Retry re-renders the page (never shows zeros). */
export function RefreshRetryRow({ thing, className }: { thing: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <RetryRow thing={thing} busy={pending} onRetry={() => start(() => router.refresh())} className={className} />;
}
