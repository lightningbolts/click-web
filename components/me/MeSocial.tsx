'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Building2, Hand, History, Sun } from 'lucide-react';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { toast } from '@/components/ds/Toast';
import { Toggle } from '@/components/ds/Toggle';
import { AvailabilitySheet } from '@/components/home/AvailabilitySheet';
import { homeRequest } from '@/lib/home/postHomeAction';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';

/** Me › Social (spec §7.7): Free now, the availability post, History, Saved events and Places. */
export function MeSocial({
  intents,
  placesEnabled,
  untilLabel,
}: {
  intents: AvailabilityIntentRow[];
  placesEnabled: boolean;
  /** Server-formatted end of the latest intent. */
  untilLabel: string | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const free = intents.length > 0;

  const stopBeingFree = async () => {
    setBusy(true);
    try {
      await Promise.all(intents.map((i) => homeRequest('DELETE', `/api/user/availability-intents?id=${encodeURIComponent(i.id)}`)));
      toast.success('You’re no longer marked free');
      startRefresh(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t update your availability.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListGroup header="Social">
        <ListRow
          icon={Sun}
          title="Free now"
          subtitle={free && untilLabel ? `Your Clicks can see it until ${untilLabel}` : 'Let your Clicks know you’re around'}
          trailing={
            <Toggle
              checked={free}
              disabled={busy || refreshing}
              onCheckedChange={(on) => (on ? setSheetOpen(true) : void stopBeingFree())}
              aria-label="Free now"
            />
          }
        />
        <ListRow icon={Hand} title="Availability post" subtitle={free ? intents.map((i) => i.intent_tag).join(', ') : undefined} onClick={() => setSheetOpen(true)} chevron />
        <ListRow icon={History} title="History" href="/me/history" chevron />
        <ListRow icon={Bookmark} title="Saved events" href="/events?view=saved" chevron />
        {placesEnabled ? <ListRow icon={Building2} title="Places" href="/me/places" chevron /> : null}
      </ListGroup>
      <AvailabilitySheet open={sheetOpen} onOpenChange={setSheetOpen} onShared={() => startRefresh(() => router.refresh())} />
    </>
  );
}
