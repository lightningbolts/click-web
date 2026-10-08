'use client';

import {
  CalendarX2,
  CircleAlert,
  CircleCheck,
  OctagonX,
  QrCode,
  ReceiptText,
  UserSearch,
  TriangleAlert,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { createElement, useRef, useState } from 'react';
import { Avatar } from '@/components/ds/Avatar';
import { Spinner } from '@/components/ds/Spinner';
import { GuestLookupSheet } from '@/components/events/tickets/GuestLookupSheet';
import { cn } from '@/lib/cn';
import { useQrScanner } from '@/lib/ui/useQrScanner';
import { useWakeLock } from '@/lib/ui/useWakeLock';

type ScanResult =
  | 'checked_in'
  | 'already_checked_in'
  | 'not_going'
  | 'wrong_event'
  | 'refunded'
  | 'event_cancelled'
  | 'invalid';

type Scan = {
  result: ScanResult;
  attendee: { user_id: string; name: string; avatar_url: string | null } | null;
  /** Ticketed events: the ticket type, shown under the holder's name. */
  tier_name?: string | null;
  checked_in_at: string | null;
  check_in_count?: number;
};

type Outcome = { key: number } & ({ kind: 'scan'; scan: Scan } | { kind: 'failed'; message: string });

type Look = { icon: LucideIcon; tone: 'online' | 'warning' | 'destructive'; title: string; detail: string | null };

const TONES = {
  online: { icon: 'text-online-text', box: 'bg-online/15' },
  warning: { icon: 'text-warning-text', box: 'bg-warning-fill' },
  destructive: { icon: 'text-destructive', box: 'bg-destructive-fill' },
} as const;

/** The same pass held in frame isn't sent again for this long. */
const REPEAT_MS = 3_000;

function look(outcome: Outcome, timeZone: string, noun: string): Look {
  if (outcome.kind === 'failed') return { icon: WifiOff, tone: 'warning', title: `Couldn’t check this ${noun}`, detail: outcome.message };
  const { scan } = outcome;
  switch (scan.result) {
    case 'checked_in':
      return {
        icon: CircleCheck,
        tone: 'online',
        title: 'Checked in',
        detail: scan.check_in_count != null ? `${scan.check_in_count} here now` : null,
      };
    case 'already_checked_in': {
      const at = scan.checked_in_at
        ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(Date.parse(scan.checked_in_at))
        : null;
      return { icon: TriangleAlert, tone: 'warning', title: 'Already checked in', detail: at ? `At ${at}. Make sure it’s them.` : 'Make sure it’s them.' };
    }
    case 'not_going':
      return { icon: OctagonX, tone: 'destructive', title: 'Not on the list', detail: 'Their RSVP isn’t active for this event.' };
    case 'wrong_event':
      return { icon: CalendarX2, tone: 'warning', title: `${noun === 'ticket' ? 'Ticket' : 'Pass'} for another event`, detail: null };
    case 'refunded':
      return { icon: ReceiptText, tone: 'destructive', title: 'Refunded', detail: 'This ticket was refunded.' };
    case 'event_cancelled':
      return { icon: CalendarX2, tone: 'destructive', title: 'Event cancelled', detail: 'Tickets for this event no longer admit anyone.' };
    default:
      return { icon: QrCode, tone: 'destructive', title: 'Not a Click Pass', detail: null };
  }
}

/** A short buzz where the browser can (Android): success once, anything else twice. */
function buzz(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 30 : [30, 60, 30]);
  } catch {
    /* not allowed here */
  }
}

/**
 * The host's door (spec 06 §7, iOS `PassScannerView`): scan Click Passes to check people in.
 * Every scan shows whose pass it is (name and photo, to match against the face in front of you)
 * and what that means: in, already in (a shared screenshot), or not on the list. The server
 * decides; nothing is assumed here.
 */
export function PassScanner({
  beaconId,
  title,
  closeHref,
  timeZone,
  ticketed = false,
}: {
  beaconId: string;
  title: string;
  closeHref: string;
  timeZone: string;
  /** Ticketed events scan tickets and can look a guest up by name. */
  ticketed?: boolean;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const noun = ticketed ? 'ticket' : 'pass';
  const [checking, setChecking] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const busy = useRef(false);
  const lookupOpen = useRef(false);
  const lastRead = useRef<{ value: string; at: number } | null>(null);
  useWakeLock(true);

  const show = (scan: Scan) => {
    if (scan.check_in_count != null) setCount(scan.check_in_count);
    buzz(scan.result === 'checked_in');
    setOutcome({ key: Date.now(), kind: 'scan', scan });
  };

  const check = async (value: string) => {
    const now = Date.now();
    // The camera keeps running under the lookup sheet; codes it sees meanwhile are ignored.
    if (busy.current || lookupOpen.current) return;
    if (lastRead.current?.value === value && now - lastRead.current.at < REPEAT_MS) return;
    busy.current = true;
    lastRead.current = { value, at: now };
    setChecking(true);
    try {
      const res = await fetch(`/api/beacons/${encodeURIComponent(beaconId)}/pass/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: value }),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Only the host can check people in.'
            : res.status === 503
              ? 'Click Pass isn’t available right now.'
              : 'Check your connection and scan again.',
        );
      }
      show((await res.json()) as Scan);
    } catch (err) {
      // Let the same pass be tried again straight away.
      lastRead.current = null;
      buzz(false);
      const message = err instanceof Error && !(err instanceof TypeError) ? err.message : 'Check your connection and scan again.';
      setOutcome({ key: now, kind: 'failed', message });
    } finally {
      busy.current = false;
      setChecking(false);
    }
  };

  const { videoRef, status } = useQrScanner(true, (raw) => void check(raw));
  const shown = outcome ? look(outcome, timeZone, noun) : null;
  const heading = ticketed ? 'Scan Tickets' : 'Scan Passes';
  const openLookup = (open: boolean) => {
    lookupOpen.current = open;
    setLookingUp(open);
  };
  const holder = outcome?.kind === 'scan' ? outcome.scan.attendee : null;

  return (
    <div role="dialog" aria-modal="true" aria-label={heading} className="fixed inset-0 z-[70] bg-black text-white" data-testid="pass-scanner">
      <video ref={videoRef} muted playsInline aria-label="Camera preview" className="absolute inset-0 size-full object-cover" />

      {status === 'denied' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <CircleAlert size={32} strokeWidth={1.75} aria-hidden className="text-white/70" />
          <p className="type-body-strong max-w-[32ch]">
            {ticketed ? 'Camera access is required to scan tickets.' : 'Camera access is required to scan Click Passes.'}
          </p>
          <p className="type-meta max-w-[36ch] text-white/70">Allow it in your browser’s site settings, then reload.</p>
        </div>
      ) : (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1/2 top-[44%] aspect-square w-[min(68vw,58vh,320px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_0_0_100vmax_rgba(0,0,0,0.32)] transition-opacity',
            status === 'scanning' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

      <header className="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h1 className="type-body-strong">{heading}</h1>
          <p className="type-meta truncate text-white/70">{title}</p>
        </div>
        <Link
          href={closeHref}
          aria-label="Close scanner"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors hover:bg-white/25"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </Link>
      </header>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(24px,env(safe-area-inset-bottom))]" aria-live="polite">
        <div className="mx-auto w-full max-w-[480px]">
          {outcome && shown ? (
            <div key={outcome.key} className="ds-scale-in rounded-xl bg-bg-elevated p-4 text-fg shadow-overlay">
              {holder ? (
                <div className="mb-3.5 flex items-center gap-3.5">
                  <Avatar seed={holder.user_id} name={holder.name} src={holder.avatar_url} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="type-title-3 line-clamp-2 text-fg [overflow-wrap:anywhere]">{holder.name}</p>
                    {outcome?.kind === 'scan' && outcome.scan.tier_name ? (
                      <p className="type-meta truncate text-fg-secondary">{outcome.scan.tier_name}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className={cn('flex items-center gap-2.5 rounded-lg p-3', TONES[shown.tone].box)}>
                {createElement(shown.icon, { size: 26, strokeWidth: 2, 'aria-hidden': true, className: cn('shrink-0', TONES[shown.tone].icon) })}
                <div className="min-w-0 flex-1">
                  <p className="type-body-strong text-fg">{shown.title}</p>
                  {shown.detail ? <p className="type-meta text-fg-secondary">{shown.detail}</p> : null}
                </div>
                {checking ? <Spinner /> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-black/60 px-5 py-3.5 text-center backdrop-blur-md">
              <p className="type-body-strong">{checking ? 'Checking…' : ticketed ? 'Scan a ticket' : 'Scan a Click Pass'}</p>
              <p className="type-meta mt-0.5 text-white/70">
                {count != null
                  ? `${count} checked in so far`
                  : ticketed
                    ? 'Guests find their ticket on the event page.'
                    : 'Guests find it on the event page once they RSVP.'}
              </p>
            </div>
          )}
          {ticketed ? (
            <button
              type="button"
              onClick={() => openLookup(true)}
              className="type-body-strong mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-white/15 backdrop-blur-md transition-colors hover:bg-white/25"
            >
              <UserSearch size={18} strokeWidth={2} aria-hidden />
              Look up guest
            </button>
          ) : null}
        </div>
      </div>
      {ticketed ? (
        <GuestLookupSheet
          beaconId={beaconId}
          open={lookingUp}
          onOpenChange={openLookup}
          onResult={(scan) => show(scan as Scan)}
          onError={(message) => {
            buzz(false);
            setOutcome({ key: Date.now(), kind: 'failed', message });
          }}
        />
      ) : null}
    </div>
  );
}
