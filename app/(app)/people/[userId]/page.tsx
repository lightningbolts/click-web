import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PersonProfile } from '@/components/people/PersonProfile';

export const metadata: Metadata = { title: 'Profile · Click', robots: { index: false } };

/** Someone you've met (spec §7.3). Profiles are private, so the page renders on the client. */
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={null}>
      <PersonProfile key={userId} userId={decodeURIComponent(userId)} />
    </Suspense>
  );
}
