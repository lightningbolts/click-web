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
        'w-[min(100%,20rem)] overflow-hidden rounded-[16px] border bg-surface text-on-surface',
        isMine ? 'border-primary/40' : 'border-border-hard',
      )}
      data-testid="plan-card"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-container text-on-primary-container">
          <CalendarDays className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
            {over ? 'Plan · done' : 'Plan'}
          </p>
          <p className="mt-0.5 break-words text-base font-bold leading-snug">{plan.title}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{planWhenText(plan)}</p>
          {plan.placeName ? (
            maps ? (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{plan.placeName}</span>
              </a>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-on-surface-variant">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {plan.placeName}
              </p>
            )
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-hard px-4 py-2.5">
        <p className="text-xs font-semibold text-on-surface-variant">
          {going.length} going{declined.length > 0 ? ` · ${declined.length} can't` : ''}
        </p>
        {!over && onRsvp ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onRsvp(message, true)}
              aria-pressed={imGoing}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-[8px] border px-2.5 text-xs font-bold',
                imGoing ? 'border-primary bg-primary text-on-primary' : 'border-border-hard text-on-surface hover:bg-surface-container-low',
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
                'inline-flex h-8 items-center gap-1 rounded-[8px] border px-2.5 text-xs font-bold',
                imOut ? 'border-on-surface bg-on-surface text-surface' : 'border-border-hard text-on-surface hover:bg-surface-container-low',
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
