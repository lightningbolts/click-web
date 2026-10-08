'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ds/Button';
import { EmptyState } from '@/components/ds/EmptyState';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { PersonRow } from '@/components/ds/PersonRow';
import { SearchField } from '@/components/ds/SearchField';
import { Sheet } from '@/components/ds/Sheet';
import { Skeleton } from '@/components/ds/Skeleton';
import { StatusPill } from '@/components/ds/StatusPill';
import {
  TicketingError,
  attendeesUrl,
  checkInTicket,
  searchAttendees,
  ticketingErrorMessage,
  type TicketScan,
} from '@/lib/ticketing/ticketingClient';
import type { TicketAttendee } from '@/lib/ticketing/types';
import { useDebounced } from '@/lib/ui/useDebounced';

const PILL: Partial<Record<TicketAttendee['status'], { label: string; variant: 'success' | 'neutral' }>> = {
  checked_in: { label: 'Checked in', variant: 'success' },
  refunded: { label: 'Refunded', variant: 'neutral' },
  void: { label: 'Void', variant: 'neutral' },
};

/**
 * The door's fallback when a code won't scan (cracked screen, dead phone): find the guest by name
 * or ticket number and check them in by ticket. The verdict goes back to the scanner's outcome card.
 */
export function GuestLookupSheet({
  beaconId,
  open,
  onOpenChange,
  onResult,
  onError,
}: {
  beaconId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (scan: TicketScan) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 250);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error } = useSWR(open ? attendeesUrl(beaconId, q) : null, searchAttendees, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const checkIn = async (attendee: TicketAttendee) => {
    setBusy(attendee.ticket_id);
    try {
      onResult(await checkInTicket(beaconId, attendee.ticket_id));
    } catch (e) {
      onError(ticketingErrorMessage(e instanceof TicketingError ? e : new TicketingError(0, 'network')));
    } finally {
      setBusy(null);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Look up guest" size="lg">
      <SearchField
        label="Search guests"
        placeholder="Name or ticket number"
        value={query}
        onValueChange={setQuery}
        autoFocus
        className="mb-3"
      />
      {error && !data ? (
        <InlineNotice variant="warning">We couldn’t load guests. Check your connection.</InlineNotice>
      ) : !data ? (
        <div className="space-y-2">
          <Skeleton rounded="lg" className="h-14 w-full" />
          <Skeleton rounded="lg" className="h-14 w-full" />
        </div>
      ) : data.attendees.length === 0 ? (
        <EmptyState
          icon={Search}
          title={q ? 'No matches' : 'No tickets yet'}
          body={q ? 'Try their last name or the code under their QR.' : 'People who get tickets show up here.'}
          headingLevel="h3"
        />
      ) : (
        <ul>
          {data.attendees.map((a) => {
            const pill = PILL[a.status];
            return (
              <li key={a.ticket_id} className="[&+&]:shadow-[inset_0_1px_0_var(--hairline)]">
                <PersonRow
                  seed={a.user_id}
                  name={a.name}
                  src={a.avatar_url}
                  subtitle={<span className="tabular">{`${a.tier_name} · ${a.ticket_number}`}</span>}
                  trailing={
                    pill ? (
                      <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy === a.ticket_id}
                        disabled={busy != null}
                        aria-label={`Check in ${a.name}`}
                        onClick={() => void checkIn(a)}
                      >
                        Check in
                      </Button>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
