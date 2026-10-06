import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AddClick } from '@/components/add/AddClick';

export const metadata: Metadata = { title: 'Add Click · Click', robots: { index: false } };

export default function Page() {
  return (
    <Suspense>
      <AddClick />
    </Suspense>
  );
}
