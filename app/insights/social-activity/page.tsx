'use client';

import dynamic from 'next/dynamic';

const SocialActivityClient = dynamic(() => import('./SocialActivityClient'), {
  ssr: false,
});

export default function SocialActivityPage() {
  return <SocialActivityClient />;
}