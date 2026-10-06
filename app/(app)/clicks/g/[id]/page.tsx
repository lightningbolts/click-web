import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Group · Click', robots: { index: false } };

/** The thread is rendered by `clicks/layout.tsx`, which reads the route (spec §7.2). */
export default function Page() {
  return null;
}
