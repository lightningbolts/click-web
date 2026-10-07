'use client';

import { MessagesSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ds/Button';
import { Sheet } from '@/components/ds/Sheet';
import EventChatPanel from '@/components/events/EventChatPanel';
import { useAuth } from '@/lib/AuthContext';

/**
 * "Open event chat" (spec §7.6.2): the chat lives in a sheet, so the page stays calm and
 * the realtime channel only opens when someone asks for it. `#chat` opens it (the Click Pass's
 * "Ask in event chat").
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

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#chat') setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Closing forgets the hash, so a reload or Back doesn't open the chat again.
    if (!next && window.location.hash === '#chat') {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  };

  if (!user) return null;
  return (
    <>
      <Button variant="secondary" icon={MessagesSquare} onClick={() => setOpen(true)}>
        Open event chat
      </Button>
      <Sheet open={open} onOpenChange={onOpenChange} title="Event chat" description="Hosts and everyone going." size="lg" padded={false} initialDetent="large">
        {open ? <EventChatPanel beaconId={beaconId} creatorId={creatorId} ended={ended} initialGoing={initialGoing} bare /> : null}
      </Sheet>
    </>
  );
}
