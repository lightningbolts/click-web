'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { authedJson } from '@/lib/api/authedJson';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error ? <InlineNotice variant="destructive">{error}</InlineNotice> : null}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { place_id } = await authedJson<{ place_id: string }>(`/api/places/invites/${encodeURIComponent(token)}/accept`, {
              method: 'POST',
              fallback: 'Couldn’t accept the invite.',
            });
            router.push(`/business/places/${place_id}`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Couldn’t accept the invite.');
            setBusy(false);
          }
        }}
      >
        Accept invite
      </Button>
    </div>
  );
}
