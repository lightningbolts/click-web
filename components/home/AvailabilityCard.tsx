'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Chip } from '@/components/ds/Chip';
import { IconButton } from '@/components/ds/IconButton';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { Sheet } from '@/components/ds/Sheet';
import { TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { Toggle } from '@/components/ds/Toggle';
import {
  AVAILABILITY_INTENT_DURATION_PRESETS,
  DEFAULT_AVAILABILITY_INTENT_DURATION_MS,
} from '@/lib/availabilityIntentDurations';
import { formatTimeLeft } from '@/lib/home/format';
import { homeRequest } from '@/lib/home/postHomeAction';
import type { HomeAvailability } from '@/lib/home/types';
import { threadHref } from '@/lib/shell/appNav';

const TAG_MAX = 25;
const QUICK_PRESETS = ['1 hour', '3 hours', '6 hours'];
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
  const [tag, setTag] = useState('');
  const [durationMs, setDurationMs] = useState(DEFAULT_AVAILABILITY_INTENT_DURATION_MS);
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const intentTag = tag.trim();
    if (!intentTag) return;
    const ok = await run(() => homeRequest('POST', PATH, { intent_tag: intentTag, durationMs }), 'You’re free — Clicks can see it');
    if (ok) {
      setTag('');
      setSheetOpen(false);
    }
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

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="I’m free for…"
        description="Visible to your Clicks until it expires."
        footer={
          <Button type="submit" form="home-availability-form" fullWidth size="lg" loading={busy} disabled={!tag.trim()}>
            Share
          </Button>
        }
      >
        <form id="home-availability-form" onSubmit={onSubmit} className="flex flex-col gap-5">
          <TextField
            label="What are you up for?"
            placeholder="Coffee, a walk, study session…"
            value={tag}
            maxLength={TAG_MAX}
            onChange={(e) => setTag(e.target.value)}
            help={`${tag.length}/${TAG_MAX}`}
            autoFocus
          />
          <fieldset>
            <legend className="type-meta mb-2 font-semibold text-fg-secondary">For how long</legend>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_INTENT_DURATION_PRESETS.filter((p) => QUICK_PRESETS.includes(p.label) || p.ms === durationMs).map(
                (p) => (
                  <Chip key={p.label} selected={durationMs === p.ms} onClick={() => setDurationMs(p.ms)}>
                    {p.label}
                  </Chip>
                ),
              )}
            </div>
          </fieldset>
        </form>
      </Sheet>
    </section>
  );
}
