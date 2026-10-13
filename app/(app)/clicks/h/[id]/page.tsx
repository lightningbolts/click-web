import type { Metadata } from 'next';
import { CLICKS_TITLES } from '@/lib/clicks/route';

export const metadata: Metadata = { title: CLICKS_TITLES.h, robots: { index: false } };

/** The thread is rendered by `clicks/layout.tsx`, which reads the route (spec §7.2). */
export default function Page() {
  return null;
}
