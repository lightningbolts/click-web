'use client';

import dynamic from 'next/dynamic';

const VibeStreamClient = dynamic(() => import('./VibeStreamClient'), {
  ssr: false,
});

export default function VibeStreamPage() {
  return <VibeStreamClient />;
}