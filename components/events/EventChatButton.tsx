'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { hubRequest } from '@/lib/hub/client';
import { hubThreadHref } from '@/lib/shell/appNav';

export default function EventChatButton({ beaconId }: { beaconId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;
  async function open() {
    setBusy(true); setError('');
    try {
      const { hub_id } = await hubRequest<{ hub_id: string }>(`/api/beacons/${encodeURIComponent(beaconId)}/event-chat`);
      router.push(hubThreadHref(hub_id));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <button type="button" disabled={busy} onClick={() => void open()} className="w-full rounded-xl border-2 border-border-hard px-4 py-3 font-semibold disabled:opacity-50">{busy ? 'Opening chat…' : 'Open event chat'}</button>
    {error ? <p role="alert" className="mt-2 text-sm">{error}</p> : null}
  </div>;
}
