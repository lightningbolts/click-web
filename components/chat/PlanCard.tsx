'use client';

import { CalendarDays, Check, MapPin, X } from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import {
  planIsOver,
  planMapsUrl,
  planRsvps,
  planWhenText,
  type HangoutPlan,
} from '@/lib/chat/plans';
import { cn } from '@/lib/cn';

/**
 * A plan message rendered as a card with exclusive Going / Can't make it RSVPs
 * (✅ / ❌ reactions, same as iOS). Plans that are over keep their card but drop the RSVP
 * controls.
 */
export function PlanCard({
  plan,
  message,
  currentUserId,
  isMine,
  onRsvp,
}: {
  plan: HangoutPlan;
  message: Message;
  currentUserId: string;
  isMine: boolean;
  onRsvp?: (message: Message, going: boolean) => void;
}) {
  const { going, declined } = planRsvps(message);
  const imGoing = going.includes(currentUserId);
  const imOut = declined.includes(currentUserId);
  const over = planIsOver(plan);
  const maps = planMapsUrl(plan);

  return (
    <div
      className={cn(
        'w-[min(100%,20rem)] overflow-hidden rounded-lg border bg-bg-elevated text-fg shadow-overlay',
        isMine ? 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)]' : 'border-hairline',
      )}
      data-testid="plan-card"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-selection text-accent">
          <CalendarDays className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="type-badge uppercase text-fg-tertiary">
            {over ? 'Plan · done' : 'Plan'}
          </p>
          <p className="type-headline mt-0.5 break-words">{plan.title}</p>
          <p className="type-meta mt-1 text-fg-secondary">{planWhenText(plan)}</p>
          {plan.placeName ? (
            maps ? (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="type-meta mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{plan.placeName}</span>
              </a>
            ) : (
              <p className="type-meta mt-1 inline-flex items-center gap-1 text-fg-secondary">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {plan.placeName}
              </p>
            )
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2.5">
        <p className="type-meta tabular font-semibold text-fg-secondary">
          {going.length} going{declined.length > 0 ? ` · ${declined.length} can't` : ''}
        </p>
        {!over && onRsvp ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onRsvp(message, true)}
              aria-pressed={imGoing}
              className={cn(
                'press type-meta inline-flex h-8 items-center gap-1 rounded-pill px-3 font-semibold',
                imGoing ? 'bg-action text-white' : 'bg-fill-subtle text-fg hover:bg-hover',
              )}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Going
            </button>
            <button
              type="button"
              onClick={() => onRsvp(message, false)}
              aria-pressed={imOut}
              className={cn(
                'press type-meta inline-flex h-8 items-center gap-1 rounded-pill px-3 font-semibold',
                imOut ? 'bg-fg text-bg' : 'bg-fill-subtle text-fg hover:bg-hover',
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Can&apos;t
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
