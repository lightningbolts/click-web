'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import { cn } from '@/lib/cn';
import type { WorkspacePlace } from './PlaceWorkspaceContext';
import { placeBase } from '@/lib/places/workspace';

export type ChecklistStep = {
  id: 'photo' | 'hours' | 'description' | 'verification' | 'live' | 'qr' | 'event';
  done: boolean;
  title: string;
  subtitle: string;
  href: string;
  action?: 'go-live' | 'submit';
};

/** What's left before the Place is live, in the order a business does it (spec §9.5). */
export function setupSteps(place: WorkspacePlace, opts: { hasEvent: boolean }): ChecklistStep[] {
  const base = placeBase(place.id);
  const verified = place.verification_status === 'verified';
  const owner = place.role === 'owner';
  const steps: ChecklistStep[] = [
    { id: 'photo', done: Boolean(place.photo_url), title: 'Add a photo', subtitle: 'The first thing people see on your Place page.', href: `${base}/profile` },
    { id: 'hours', done: Boolean(place.hours && Object.keys(place.hours).length), title: 'Add hours', subtitle: 'So people know when to come by.', href: `${base}/profile` },
    { id: 'description', done: Boolean(place.description), title: 'Add a description', subtitle: 'A line or two about what it’s like to be there.', href: `${base}/profile` },
    place.verification_status === 'draft'
      ? {
          id: 'verification',
          done: false,
          title: 'Submit for review',
          subtitle: 'Click checks every Place before it goes on the map.',
          href: base,
          action: owner ? 'submit' : undefined,
        }
      : {
          id: 'verification',
          done: verified,
          title: verified ? 'Verified by Click' : 'In review',
          subtitle: verified ? 'Confirmed as a real, physical place.' : 'Usually within one business day. Keep setting up meanwhile.',
          href: base,
        },
  ];
  if (owner) {
    steps.push({
      id: 'live',
      done: place.listed,
      title: 'Go live',
      subtitle: verified ? 'Show your pin, Place page and events to people nearby.' : 'Available once Click verifies your Place.',
      href: base,
      action: verified && !place.listed ? 'go-live' : undefined,
    });
  }
  steps.push(
    { id: 'qr', done: false, title: 'Print your check-in QR', subtitle: 'Put it by the counter or door.', href: `${base}/qr` },
    { id: 'event', done: opts.hasEvent, title: 'Create your first event', subtitle: 'Free for every Place.', href: `/events/new?host=place:${place.id}` },
  );
  return steps;
}

export function SetupChecklist({ place, hasEvent }: { place: WorkspacePlace; hasEvent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const steps = setupSteps(place, { hasEvent });
  const remaining = steps.filter((s) => !s.done).length;

  const act = async (step: ChecklistStep) => {
    setBusy(step.id);
    try {
      await authedJson(`/api/places/${place.id}`, {
        method: 'PATCH',
        body: step.action === 'go-live' ? { listed: true } : { submit_for_review: true },
        fallback: 'Couldn’t update your Place.',
      });
      toast.success(step.action === 'go-live' ? 'Your Place is live' : 'Submitted for review');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t update your Place.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="setup-heading">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="setup-heading" className="type-headline text-fg">
          Get your Place ready
        </h2>
        <span className="type-meta tabular text-fg-tertiary">{remaining} left</span>
      </div>
      <ol className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                s.done ? 'bg-action text-on-action' : 'shadow-[inset_0_0_0_2px_var(--fill-strong)]',
              )}
            >
              {s.done ? <Check size={14} strokeWidth={3} /> : null}
            </span>
            <Link href={s.href} className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn('type-body-strong block text-fg', s.done && 'text-fg-secondary')}>
                  {s.title}
                  <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                </span>
                <span className="type-meta block text-fg-tertiary">{s.subtitle}</span>
              </span>
              {s.action ? null : <ChevronRight size={16} aria-hidden className="text-fg-tertiary" />}
            </Link>
            {s.action ? (
              <Button size="sm" variant="primary" loading={busy === s.id} disabled={busy != null} onClick={() => void act(s)}>
                {s.action === 'go-live' ? 'Go live' : 'Submit'}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
