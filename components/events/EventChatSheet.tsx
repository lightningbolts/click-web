'use client';

import { MessagesSquare } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ds/Button';
import { Sheet } from '@/components/ds/Sheet';
import EventChatPanel from '@/components/events/EventChatPanel';
import { useAuth } from '@/lib/AuthContext';

/**
 * "Open event chat" (spec §7.6.2): the chat lives in a sheet, so the page stays calm and
 * the realtime channel only opens when someone asks for it.
 */
export function EventChatSheet({
  beaconId,
  creatorId,
  ended,
  initialGoing,
}: {
  beaconId: string;
  creatorId: string | null;
  ended: boolean;
  initialGoing: boolean | null;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <Button variant="secondary" icon={MessagesSquare} onClick={() => setOpen(true)}>
        Open event chat
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Event chat" description="Hosts and everyone going." size="lg" padded={false}>
        {open ? <EventChatPanel beaconId={beaconId} creatorId={creatorId} ended={ended} initialGoing={initialGoing} bare /> : null}
      </Sheet>
    </>
  );
}
