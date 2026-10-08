'use client';

import { Ban, CalendarX2, ChevronLeft, ChevronRight, RotateCcw, Ticket, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from '@/components/ds/IconButton';
import { PassQrPlate } from '@/components/events/PassQrPlate';
import type { OwnedTicket } from '@/lib/ticketing/types';

/** The one line under the holder's name for the ticket on screen. */
export function ticketStatusLine(ticket: OwnedTicket, { cancelled, live, timeZone }: { cancelled: boolean; live: boolean; timeZone: string }): string {
  if (cancelled) return 'Event cancelled';
  switch (ticket.status) {
    case 'refunded':
      return 'Refunded';
    case 'void':
      return 'No longer valid';
    case 'checked_in': {
      const at = ticket.checked_in_at ? Date.parse(ticket.checked_in_at) : NaN;
      return Number.isFinite(at)
        ? `Checked in at ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(at)}`
        : 'Checked in';
    }
    case 'valid':
      return live ? 'Going · show this at the door' : 'Going';
  }
}

/** Where the QR would be, when the ticket no longer admits. Same footprint, so paging doesn't jump. */
function NoEntry({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex aspect-square w-full max-w-[260px] flex-col items-center justify-center gap-2 rounded-[20px] bg-fill-subtle p-6 text-center">
      <Icon size={28} strokeWidth={1.75} aria-hidden className="text-fg-secondary" />
      <p className="type-body-strong text-fg">{title}</p>
      <p className="type-meta text-fg-secondary">{body}</p>
    </div>
  );
}

/** Ignore arrows meant for something else: a field, an open menu, a slider. */
function arrowsBelongElsewhere(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="slider"]'));
}

/**
 * Your tickets for one event, one at a time (spec §5.4): tier and number, the QR, and `1 of 3`
 * paging with buttons and ←/→. Controlled, so the page can act on the ticket on screen.
 */
export function TicketPager({
  tickets,
  index,
  onIndexChange,
  cancelled,
  holderName,
}: {
  tickets: OwnedTicket[];
  index: number;
  onIndexChange: (index: number) => void;
  cancelled: boolean;
  holderName: string;
}) {
  const ticket = tickets[index]!;
  const count = tickets.length;

  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || arrowsBelongElsewhere(event.target)) return;
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (event.key === 'ArrowRight' && index < count - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, index, onIndexChange]);

  return (
    <div className="flex w-full flex-col items-center gap-3.5" role="group" aria-roledescription="carousel" aria-label="Your tickets">
      <div className="flex w-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="type-body-strong truncate text-fg">{ticket.tier_name}</p>
          <p className="type-meta font-mono text-fg-secondary">{ticket.ticket_number}</p>
        </div>
        {count > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton icon={ChevronLeft} variant="filled" size="sm" aria-label="Previous ticket" disabled={index === 0} onClick={() => onIndexChange(index - 1)} />
            <span className="type-meta tabular min-w-12 text-center text-fg-secondary" aria-live="polite">
              {index + 1} of {count}
            </span>
            <IconButton icon={ChevronRight} variant="filled" size="sm" aria-label="Next ticket" disabled={index === count - 1} onClick={() => onIndexChange(index + 1)} />
          </div>
        ) : null}
      </div>

      {cancelled ? (
        <NoEntry icon={CalendarX2} title="This event was cancelled" body="Paid tickets are refunded automatically." />
      ) : ticket.status === 'refunded' ? (
        <NoEntry icon={RotateCcw} title="Refunded" body="This ticket was refunded and no longer gets you in." />
      ) : ticket.status === 'void' ? (
        <NoEntry icon={Ban} title="No longer valid" body="This ticket can’t be used at the door." />
      ) : !ticket.credential_url ? (
        <NoEntry icon={Ticket} title="Code unavailable right now" body="Your ticket still counts. The host can check you in by name." />
      ) : (
        <>
          <PassQrPlate url={ticket.credential_url} label={`Ticket QR code for ${holderName}, ${ticket.code ?? ticket.ticket_number}`} />
          <p className="h-7 select-all font-mono text-xl font-semibold tracking-[0.2em] text-fg">{ticket.code}</p>
        </>
      )}
    </div>
  );
}
