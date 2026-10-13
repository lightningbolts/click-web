import type { Metadata } from 'next';
import { CLICKS_TITLES } from '@/lib/clicks/route';

export const metadata: Metadata = { title: CLICKS_TITLES.inbox };

/** The inbox is rendered by `clicks/layout.tsx` (spec §7.2). */
export default function Page() {
  return null;
}
