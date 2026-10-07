'use client';

import {
  CalendarDays,
  CalendarPlus,
  CircleCheck,
  MapPin,
  MessagesSquare,
  Navigation,
  Ticket,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useSyncExternalStore, type ComponentProps } from 'react';
import useSWR from 'swr';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { EmptyState } from '@/components/ds/EmptyState';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Skeleton } from '@/components/ds/Skeleton';
import { useMediaQuery } from '@/components/ds/useMediaQuery';
import EventBackLink from '@/components/events/EventBackLink';
import { EventCalendarMenu } from '@/components/events/EventCalendarMenu';
import { HostContactMenu, type HostContact } from '@/components/events/HostContactMenu';
import { MapsMenu } from '@/components/events/MapsMenu';
import type { CalendarEvent } from '@/lib/events/calendarLinks';
import { clickPassUrl, fetchClickPass, isAppleSafari, isAtTheDoor, type ClickPass, type ClickPassState } from '@/lib/events/eventPassClient';
import { eventSharePath } from '@/lib/events/eventUrls';
import type { MapsDestination } from '@/lib/events/mapsLinks';
import { cn } from '@/lib/cn';
import { useWakeLock } from '@/lib/ui/useWakeLock';

export type PassTicket = {
  title: string;
  seed: string;
  imageUrl: string | null;
  when: string | null;
  where: string | null;
};

const noop = () => () => {};

/** An equal-width labelled action under the ticket (iOS `EventActionTile`). */
function ActionTile({ icon: Icon, label, className, ...rest }: ComponentProps<'button'> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg bg-surface px-2 py-3 text-fg transition-colors duration-[var(--d-fast)] hover:bg-hover dark:shadow-[inset_0_0_0_1px_var(--hairline)]',
        className,
      )}
      {...rest}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden className="text-accent" />
      <span className="type-meta max-w-full truncate font-semibold">{label}</span>
    </button>
  );
}

/** The ticket's tear line: a dashed rule between two notches cut into the card's edges. */
function Perforation() {
  return (
    <div aria-hidden className="relative h-[22px]">
      <span className="absolute left-0 top-0 size-[22px] -translate-x-1/2 rounded-full bg-bg" />
      <span className="absolute inset-x-5 top-1/2 border-t-[1.5px] border-dashed border-hairline" />
      <span className="absolute right-0 top-0 size-[22px] translate-x-1/2 rounded-full bg-bg" />
    </div>
  );
}

function QrPlate({ pass, holderName }: { pass: ClickPass | null; holderName: string }) {
  const checkedIn = Boolean(pass?.checked_in_at);
  return (
    <div className="relative aspect-square w-full max-w-[260px] rounded-[20px] bg-white p-4 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
      {pass ? (
        <QRCodeSVG
          value={pass.credential_url}
          size={228}
          level="M"
          bgColor="#ffffff"
          fgColor="#000000"
          className={cn('size-full transition-opacity duration-[var(--d-slow)]', checkedIn && 'opacity-35')}
          role="img"
          aria-label={`Click Pass QR code for ${holderName}, ${pass.code}`}
        />
      ) : (
        <Skeleton className="size-full" rounded="md" shimmer />
      )}
      {checkedIn ? (
        <span className="ds-scale-in absolute inset-0 flex items-center justify-center">
          <CircleCheck size={72} strokeWidth={2} aria-hidden className="fill-online text-white drop-shadow" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Your Click Pass (spec 06 §1, iOS `ClickPassView`): a ticket with the QR your host scans at the
 * door, your name and face (what the host matches), and what you need on the way: Wallet,
 * Calendar, Directions and the host. While the event is on and you're not in yet, it re-checks
 * every few seconds, so the moment the host scans you it turns to "You're in".
 */
export function ClickPassView({
  beaconId,
  initial,
  ticket,
  holder,
  startMs,
  endMs,
  live,
  timeZone,
  calendar,
  destination,
  contact,
}: {
  beaconId: string;
  /** The pass as the server issued it with the page; null when that failed (the client retries). */
  initial: ClickPassState | null;
  ticket: PassTicket;
  holder: { userId: string; name: string; avatarUrl: string | null };
  startMs: number | null;
  /** The event's end, or its start plus six hours. */
  endMs: number | null;
  /** On now, as the page was rendered. */
  live: boolean;
  timeZone: string;
  calendar: CalendarEvent;
  destination: MapsDestination | null;
  contact: HostContact;
}) {
  const { data, error, isLoading, mutate } = useSWR(clickPassUrl(beaconId), fetchClickPass, {
    fallbackData: initial ?? undefined,
    revalidateOnMount: !initial,
    // Watch for the host's scan only while it can happen and the tab is visible (SWR pauses hidden tabs).
    refreshInterval: (latest) =>
      latest?.kind === 'ready' && !latest.pass.checked_in_at && isAtTheDoor(startMs, endMs, Date.now()) ? 4_000 : 0,
    errorRetryCount: 2,
  });
  const pass = data?.kind === 'ready' ? data.pass : null;
  const apple = useSyncExternalStore(noop, () => isAppleSafari(navigator.userAgent), () => false);
  const touch = useMediaQuery('(pointer: coarse)', false);
  useWakeLock(pass != null && !pass.checked_in_at);

  const back = <EventBackLink href={eventSharePath(beaconId)} />;

  if (data?.kind === 'not_going') {
    return (
      <>
        {back}
        <EmptyState
          icon={Ticket}
          title="No pass yet"
          body="RSVP to the event and your Click Pass appears here."
          action={
            <Button variant="primary" href={eventSharePath(beaconId)}>
              View event
            </Button>
          }
        />
      </>
    );
  }
  if (!data && error && !isLoading) {
    return (
      <>
        {back}
        <EmptyState
          icon={Ticket}
          title="Couldn’t load your pass"
          body="Check your connection and try again."
          action={
            <Button variant="primary" onClick={() => void mutate()}>
              Try again
            </Button>
          }
        />
      </>
    );
  }

  const checkedInAt = pass?.checked_in_at ? Date.parse(pass.checked_in_at) : null;
  const status =
    checkedInAt != null
      ? `You’re in · checked in ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(checkedInAt)}`
      : live
        ? 'Going · show this at the door'
        : 'Going';

  return (
    <>
      {back}
      <section aria-labelledby="pass-title" className="overflow-hidden rounded-xl bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        <CardVisual seed={ticket.seed} photoUrl={ticket.imageUrl} radius={0} priority sizes="440px" className="aspect-[2/1] w-full" />
        <div className="space-y-2 p-5">
          <h1 id="pass-title" className="type-title-3 text-fg [text-wrap:balance]">
            {ticket.title}
          </h1>
          {ticket.when ? (
            <p className="type-meta flex items-start gap-2 text-fg-secondary">
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
              {ticket.when}
            </p>
          ) : null}
          {ticket.where ? (
            <p className="type-meta flex items-start gap-2 text-fg-secondary">
              <MapPin size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
              <span className="line-clamp-2">{ticket.where}</span>
            </p>
          ) : null}
        </div>

        <Perforation />

        <div className="flex flex-col items-center gap-3.5 p-5">
          {data?.kind === 'unavailable' ? (
            <InlineNotice
              variant="neutral"
              className="w-full"
              action={
                <Button size="sm" variant="plain" onClick={() => void mutate()}>
                  Retry
                </Button>
              }
            >
              Your pass isn’t available right now. Your RSVP still counts; the host can check you in by name.
            </InlineNotice>
          ) : (
            <>
              <QrPlate pass={pass} holderName={holder.name} />
              <p className="h-7 select-all font-mono text-xl font-semibold tracking-[0.2em] text-fg">{pass?.code}</p>
            </>
          )}
          <div className="flex w-full items-center gap-3 rounded-lg bg-fill-subtle p-3">
            <Avatar seed={holder.userId} name={holder.name} src={holder.avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="type-body-strong truncate text-fg">{holder.name}</p>
              <p className={cn('type-meta', checkedInAt != null ? 'text-online-text' : 'text-fg-secondary')} aria-live="polite">
                {status}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 space-y-2.5">
        {pass?.wallet_available && apple ? (
          <a
            href={`${clickPassUrl(beaconId)}/wallet`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-black font-semibold text-white transition-opacity hover:opacity-85 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]"
          >
            <Wallet size={18} strokeWidth={2} aria-hidden />
            Add to Apple Wallet
          </a>
        ) : null}
        <div className="flex gap-2.5">
          <EventCalendarMenu event={calendar} trigger={<ActionTile icon={CalendarPlus} label="Calendar" />} />
          {destination ? (
            <MapsMenu destination={destination} directions trigger={<ActionTile icon={Navigation} label="Directions" />} />
          ) : null}
          <HostContactMenu beaconId={beaconId} contact={contact} trigger={<ActionTile icon={MessagesSquare} label="Contact" />} />
        </div>
      </div>

      <p className="type-meta mt-5 text-balance px-3 text-center text-fg-tertiary">
        Your host scans this at the door. It’s yours alone: if it’s shared, the host sees your name and photo.
        {touch ? ' Turn your brightness up so it scans first time.' : null}
      </p>
    </>
  );
}
