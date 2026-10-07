'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { MetaRow } from '@/components/ds/MetaRow';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { Sheet } from '@/components/ds/Sheet';
import EventRsvpDirectory from '@/components/events/EventRsvpDirectory';
import { useAuth } from '@/lib/AuthContext';
import { eventRsvpKey } from '@/lib/events/eventRsvpKey';
import { fetchEventRsvpPayload, fetchMutualAttendees, mutualAttendeesKey } from '@/lib/events/eventRsvpClient';
import { personHref } from '@/lib/shell/appNav';

const MAX_FACES = 12;


/** Signed-in meta row (spec §7.6.2): "{N} going · {M} of your Clicks". */
export function EventGoingMetaRow({ beaconId, count, ended }: { beaconId: string; count: number; ended: boolean }) {
  const { user } = useAuth();
  const { data: rsvp } = useSWR(user ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload, { revalidateOnFocus: false });
  const { data: mutual } = useSWR(user ? mutualAttendeesKey(beaconId) : null, fetchMutualAttendees, { revalidateOnFocus: false });
  if (!user) return null;
  const going = rsvp?.rsvp_count ?? count;
  const clicks = mutual?.count ?? 0;
  if (going === 0) return null;
  return (
    <MetaRow
      icon={Users}
      title={`${going} ${ended ? 'went' : 'going'}`}
      subtitle={clicks > 0 ? `${clicks} of your Clicks` : undefined}
    />
  );
}

/**
 * People here (spec §7.6.2, signed in): up to twelve faces, then "See all" opens the
 * guest directory in a sheet. Hidden guest lists only reach hosts (the API enforces it).
 */
export function EventPeopleSection({ beaconId, ended }: { beaconId: string; ended: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data } = useSWR(user ? eventRsvpKey(beaconId) : null, fetchEventRsvpPayload, { revalidateOnFocus: false });
  const people = data?.attendees ?? [];
  if (!user || people.length === 0) return null;
  return (
    <section aria-labelledby="event-people">
      <SectionHeader
        id="event-people"
        title={ended ? 'People who went' : 'People going'}
        action={
          <Button variant="plain" size="sm" onClick={() => setOpen(true)}>
            See all
          </Button>
        }
      />
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-3">
        {people.slice(0, MAX_FACES).map((p) => (
          <li key={p.user_id}>
            <Link href={personHref(p.user_id)} className="flex flex-col items-center gap-1 rounded-md p-1 hover:bg-hover" title={p.name}>
              <Avatar seed={p.user_id} name={p.name} src={p.avatar_url} size={40} />
              <span className="type-badge w-full truncate text-center font-normal text-fg-secondary">{p.name.split(' ')[0]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Sheet open={open} onOpenChange={setOpen} title={ended ? 'Who went' : 'Who’s going'} size="lg">
        {open ? <EventRsvpDirectory beaconId={beaconId} allowPeek /> : null}
      </Sheet>
    </section>
  );
}
