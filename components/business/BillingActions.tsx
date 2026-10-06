'use client';

import { useState } from 'react';
import { Button } from '@/components/ds/Button';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';

/** Upgrade (Checkout) or Manage billing (portal) for one Place; both leave for Stripe. */
export function BillingAction({ placeId, kind }: { placeId: string; kind: 'checkout' | 'portal' }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={kind === 'checkout' ? 'primary' : 'secondary'}
      size={kind === 'checkout' ? 'lg' : 'md'}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await authedJson<{ url: string }>(`/api/places/${placeId}/billing/${kind}`, { method: 'POST' });
          window.location.assign(url);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Couldn’t open billing.');
          setBusy(false);
        }
      }}
    >
      {kind === 'checkout' ? 'Upgrade to Click for Business' : 'Manage billing'}
    </Button>
  );
}
