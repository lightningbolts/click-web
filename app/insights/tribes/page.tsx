'use client';

import dynamic from 'next/dynamic';

const TribesClient = dynamic(() => import('./TribesClient'), { ssr: false });

export default function TribesPage() {
  return <TribesClient />;
}