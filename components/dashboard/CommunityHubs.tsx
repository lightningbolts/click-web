'use client';

import { useEffect, useRef, useState } from 'react';
import { freshHubLocation, hubRequest } from '@/lib/hub/client';
import HubConversation from './HubConversation';

export type CommunityHub = { id: string; name: string; category: string; distance_meters?: number; participant_count?: number; event_beacon_id?: string | null };
export const hubButton = 'rounded-xl border-2 border-border-hard px-4 py-2 text-sm font-semibold disabled:opacity-50';

export default function CommunityHubs({ userId, initialHubId }: { userId: string; initialHubId?: string | null }) {
  const [hubs, setHubs] = useState<CommunityHub[] | null>(null);
  const [selected, setSelected] = useState<CommunityHub | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!initialHubId) return;
    let cancelled = false;
    hubRequest<{ hub: CommunityHub }>(`/api/hub/${encodeURIComponent(initialHubId)}`)
      .then(({ hub }) => { if (!cancelled) setSelected(hub); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [initialHubId]);

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  }
  async function discover() {
    const coords = await freshHubLocation();
    const result = await hubRequest<{ hubs: CommunityHub[] }>(`/api/hub/nearby?lat=${coords.user_lat}&lon=${coords.user_long}`);
    if (mounted.current) setHubs(result.hubs);
  }
  async function join(hub: CommunityHub) {
    const coords = hub.event_beacon_id ? {} : await freshHubLocation();
    const result = await hubRequest<{ event_beacon_id: string | null }>('/api/hub/join', { hub_id: hub.id, ...coords });
    if (mounted.current) setSelected({ ...hub, event_beacon_id: result.event_beacon_id });
  }
  async function create() {
    if (!name.trim()) return;
    const coords = await freshHubLocation();
    const result = await hubRequest<{ hub_id: string }>('/api/hub/create', { name: name.trim(), category: 'general', location: { lat: coords.user_lat, lng: coords.user_long } });
    if (mounted.current) { setSelected({ id: result.hub_id, name: name.trim(), category: 'general' }); setName(''); }
  }

  if (selected) return <HubConversation key={`${userId}:${selected.id}`} hub={selected} userId={userId} onBack={() => setSelected(null)} />;
  return <div className="space-y-5">
    <section className="fc-card rounded-2xl p-5">
      <h2 className="text-xl font-bold">Meet your local community</h2>
      <p className="my-3 text-sm text-on-surface-variant">Discover nearby spaces and join the conversation while you’re there. Location is checked when you join or send a message.</p>
      <button type="button" disabled={busy} className={`${hubButton} bg-primary text-white`} onClick={() => void run(discover)}>{busy ? 'Please wait…' : 'Find nearby hubs'}</button>
      {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
    </section>
    {hubs?.length === 0 ? <p>No hubs nearby yet. Start one at your current location.</p> : null}
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {hubs?.map((hub) => <li key={hub.id} className="fc-card rounded-2xl p-5">
        <h3 className="text-lg font-bold">{hub.name}</h3>
        <p className="my-3 text-sm text-on-surface-variant">{hub.participant_count ?? 0} participants{hub.distance_meters != null ? ` · ${Math.round(hub.distance_meters)} m away` : ''}</p>
        <button type="button" disabled={busy} className={hubButton} onClick={() => void run(() => join(hub))}>Join hub</button>
      </li>)}
    </ul>
    <form className="fc-card space-y-3 rounded-2xl p-5" onSubmit={(event) => { event.preventDefault(); void run(create); }}>
      <h2 className="text-xl font-bold">Start a community hub</h2>
      <label htmlFor="hub-name" className="block text-sm">Hub name</label>
      <input id="hub-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border-2 border-border-hard bg-background p-3" />
      <p className="text-sm text-on-surface-variant">Create a hub within 50 metres of your current location.</p>
      <button disabled={busy || !name.trim()} className={hubButton}>Create hub here</button>
    </form>
  </div>;
}
