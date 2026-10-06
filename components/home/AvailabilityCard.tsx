'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { IconButton } from '@/components/ds/IconButton';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { toast } from '@/components/ds/Toast';
import { Toggle } from '@/components/ds/Toggle';
import { formatTimeLeft } from '@/lib/home/format';
import { homeRequest } from '@/lib/home/postHomeAction';
import type { HomeAvailability } from '@/lib/home/types';
import { threadHref } from '@/lib/shell/appNav';
import { AvailabilitySheet } from './AvailabilitySheet';

const PATH = '/api/user/availability-intents';

/** ⑨ / rail: "I'm free" with what for, plus Clicks whose plans overlap. */
export function AvailabilityCard({
  availability,
  nowMs,
  timeZone,
}: {
  availability: HomeAvailability;
  nowMs: number;
  /** Same zone the server rendered with, so the label hydrates identically. */
  timeZone: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { intents, matches } = availability;
  const free = intents.length > 0;
  const latestExpiry = Math.max(0, ...intents.map((i) => Date.parse(i.expires_at) || 0));
  const untilLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(latestExpiry);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      startRefresh(() => router.refresh());
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t update your availability.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onToggle = (on: boolean) => {
    if (on) {
      setSheetOpen(true);
      return;
    }
    void run(() => Promise.all(intents.map((i) => homeRequest('DELETE', `${PATH}?id=${encodeURIComponent(i.id)}`))), 'You’re no longer marked free');
  };

  return (
    <section aria-labelledby="home-availability">
      <SectionHeader
        id="home-availability"
        title="Availability"
        action={
          <Button variant="plain" size="sm" onClick={() => setSheetOpen(true)}>
            {free ? 'Add' : 'Edit'}
          </Button>
        }
      />
      <ListGroup>
        <ListRow
          title="I’m free"
          subtitle={free ? `Visible to your Clicks · until ${untilLabel}` : 'Let your Clicks know you’re around'}
          trailing={
            <Toggle
              checked={free}
              disabled={busy || refreshing}
              onCheckedChange={onToggle}
              aria-label="I’m free"
            />
          }
        />
        {intents.map((intent) => (
          <ListRow
            key={intent.id}
            title={intent.intent_tag}
            subtitle={`${formatTimeLeft(Date.parse(intent.expires_at), nowMs)} left`}
            trailing={
              <IconButton
                icon={X}
                size="sm"
                aria-label={`Remove “${intent.intent_tag}”`}
                disabled={busy}
                onClick={() => void run(() => homeRequest('DELETE', `${PATH}?id=${encodeURIComponent(intent.id)}`))}
              />
            }
          />
        ))}
      </ListGroup>

      {matches.length > 0 ? (
        <ListGroup header="Matching plans" className="mt-4">
          {matches.map((m) => (
            <ListRow
              key={m.connectionId}
              href={threadHref(m.connectionId)}
              chevron={false}
              leading={<Avatar seed={m.person.id} name={m.person.name} src={m.person.avatarUrl} size={32} />}
              title={m.person.name}
              subtitle={m.label}
              trailing={<span className="type-body-strong text-accent">Say hi</span>}
            />
          ))}
        </ListGroup>
      ) : null}

      <AvailabilitySheet open={sheetOpen} onOpenChange={setSheetOpen} onShared={() => startRefresh(() => router.refresh())} />
    </section>
  );
}
