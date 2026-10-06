'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarCheck, Cake, Hand, MessageCircle, Sparkles, Users, X, type LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Card } from '@/components/ds/Card';
import { CardVisual } from '@/components/ds/CardVisual';
import { IconButton } from '@/components/ds/IconButton';
import { StatusPill } from '@/components/ds/StatusPill';
import { toast } from '@/components/ds/Toast';
import { cn } from '@/lib/cn';
import { formatEventWhen, formatTimeLeft } from '@/lib/home/format';
import { postHomeAction } from '@/lib/home/postHomeAction';
import type { HomeOpportunity } from '@/lib/home/types';
import { eventHref, threadHref } from '@/lib/shell/appNav';

const WARNING_MS = 6 * 3_600_000;

const NUDGE_ICON: Record<string, LucideIcon> = {
  hangout_confirm: CalendarCheck,
  shared_upcoming_event: CalendarCheck,
  wave: Hand,
  anniversary: Cake,
  reconnect_lull: MessageCircle,
  memory_prompt: Sparkles,
  group_revival: Users,
};

/** "12h left" with the hours in bold; warning colour inside the last 6 h. */
export function TimeLeft({ deadlineMs, nowMs }: { deadlineMs: number; nowMs: number }) {
  const urgent = deadlineMs - nowMs <= WARNING_MS;
  return (
    <>
      <strong className={cn('font-semibold', urgent ? 'text-warning-text' : 'text-fg-secondary')}>
        {formatTimeLeft(deadlineMs, nowMs)} left
      </strong>{' '}
      before this Click is archived
    </>
  );
}

function EventHero({ opportunity, timeZone, nowMs }: { opportunity: Extract<HomeOpportunity, { kind: 'event' }>; timeZone: string; nowMs: number }) {
  const { event, live } = opportunity;
  return (
    <Card className="overflow-hidden p-0">
      <CardVisual
        seed={event.id}
        photoUrl={event.imageUrl}
        radius="lg"
        className="aspect-video rounded-b-none md:aspect-[16/5]"
        priority
      >
        <span className="absolute left-3.5 top-3.5">
          {live ? (
            <StatusPill variant="live">Live now</StatusPill>
          ) : (
            <StatusPill className="material-glass text-fg">Today</StatusPill>
          )}
        </span>
      </CardVisual>
      <div className="p-5">
        <h2 className="type-headline text-fg">{event.title}</h2>
        <p className="type-meta mt-1 text-fg-tertiary">
          {formatEventWhen(event.startAt, timeZone, nowMs)}
          {event.locationName ? ` · ${event.locationName}` : ''}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href={eventHref(event.id)} variant="primary">
            View details
          </Button>
          <Button href={`/map?event=${encodeURIComponent(event.id)}`} variant="secondary">
            Map
          </Button>
        </div>
      </div>
    </Card>
  );
}

function NudgeCard({ opportunity }: { opportunity: Extract<HomeOpportunity, { kind: 'nudge' }> }) {
  const router = useRouter();
  const { nudge, person } = opportunity;
  const [busy, setBusy] = useState<'primary' | 'decline' | 'dismiss' | null>(null);
  const confirmationId = typeof nudge.payload.confirmation_id === 'string' ? nudge.payload.confirmation_id : null;
  const Icon = NUDGE_ICON[nudge.nudge_type] ?? Sparkles;
  const id = encodeURIComponent(nudge.id);

  const run = async (kind: 'primary' | 'decline' | 'dismiss') => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'dismiss') {
        await postHomeAction(`/api/me/nudges/${id}/dismiss`);
      } else if (nudge.nudge_type === 'hangout_confirm' && confirmationId) {
        const path = `/api/hangouts/${encodeURIComponent(confirmationId)}/${kind === 'decline' ? 'decline' : 'confirm'}`;
        const result = await postHomeAction<{ status?: string; already_logged?: boolean }>(path);
        toast.success(
          kind === 'decline'
            ? 'Declined. Nothing was added to your timeline.'
            : result.status === 'waiting'
              ? 'Confirmed. It’s added once you both confirm.'
              : 'Added to your shared timeline.',
        );
      } else if (nudge.nudge_type === 'wave' && nudge.connection_id) {
        const result = await postHomeAction<{ already_waved_today?: boolean }>(`/api/connections/${encodeURIComponent(nudge.connection_id)}/wave`);
        toast.success(result.already_waved_today ? 'You already waved today.' : 'You waved back.');
      } else if (nudge.nudge_type === 'shared_upcoming_event' && nudge.beacon_id) {
        void postHomeAction(`/api/me/nudges/${id}/acted`).catch(() => undefined);
        router.push(eventHref(nudge.beacon_id));
        return;
      } else if (nudge.connection_id) {
        void postHomeAction(`/api/me/nudges/${id}/acted`).catch(() => undefined);
        router.push(threadHref(nudge.connection_id));
        return;
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t complete this. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const primaryLabel =
    nudge.nudge_type === 'hangout_confirm'
      ? 'Confirm'
      : nudge.nudge_type === 'wave'
        ? 'Wave back'
        : nudge.nudge_type === 'shared_upcoming_event'
          ? 'View event'
          : 'Say hi';

  return (
    <Card className="flex gap-4">
      <Avatar
        seed={person?.id ?? nudge.id}
        name={person?.name}
        src={person?.avatarUrl}
        size={48}
        badge={<Icon aria-hidden />}
      />
      <div className="min-w-0 flex-1">
        <h2 className="type-headline text-fg">{nudge.headline}</h2>
        <p className="type-body mt-0.5 text-fg-tertiary">{nudge.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="tinted" size="sm" loading={busy === 'primary'} disabled={busy !== null} onClick={() => void run('primary')}>
            {primaryLabel}
          </Button>
          {nudge.nudge_type === 'hangout_confirm' ? (
            <Button variant="plain" size="sm" loading={busy === 'decline'} disabled={busy !== null} onClick={() => void run('decline')}>
              We weren’t together
            </Button>
          ) : null}
        </div>
      </div>
      <IconButton icon={X} size="sm" aria-label="Not now" className="-mr-2 -mt-2" disabled={busy !== null} onClick={() => void run('dismiss')} />
    </Card>
  );
}

/** ② Exactly one promoted item (spec §7.1). */
export function OpportunityCard({ opportunity, timeZone, nowMs }: { opportunity: HomeOpportunity; timeZone: string; nowMs: number }) {
  if (opportunity.kind === 'event') return <EventHero opportunity={opportunity} timeZone={timeZone} nowMs={nowMs} />;
  if (opportunity.kind === 'nudge') return <NudgeCard opportunity={opportunity} />;
  const { person, connectionId, deadlineMs } = opportunity;
  return (
    <Card className="flex items-center gap-4">
      <Avatar seed={person.id} name={person.name} src={person.avatarUrl} size={48} />
      <div className="min-w-0 flex-1">
        <h2 className="type-headline truncate text-fg">Say hi to {person.name.split(/\s+/)[0]}</h2>
        <p className="type-meta mt-0.5 text-fg-tertiary">
          <TimeLeft deadlineMs={deadlineMs} nowMs={nowMs} />
        </p>
      </div>
      <Button href={threadHref(connectionId)} variant="tinted" size="sm">
        Say hi
      </Button>
    </Card>
  );
}
