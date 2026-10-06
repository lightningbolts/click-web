'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ds/Button';
import { Chip } from '@/components/ds/Chip';
import { Sheet } from '@/components/ds/Sheet';
import { TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { AVAILABILITY_INTENT_DURATION_PRESETS, DEFAULT_AVAILABILITY_INTENT_DURATION_MS } from '@/lib/availabilityIntentDurations';
import { homeRequest } from '@/lib/home/postHomeAction';

const TAG_MAX = 25;
const QUICK_PRESETS = ['1 hour', '3 hours', '6 hours'];

/** "I'm free for…" (Home and Me): what for and for how long, visible to your Clicks until it expires. */
export function AvailabilitySheet({
  open,
  onOpenChange,
  onShared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShared: () => void;
}) {
  const [tag, setTag] = useState('');
  const [durationMs, setDurationMs] = useState(DEFAULT_AVAILABILITY_INTENT_DURATION_MS);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const intentTag = tag.trim();
    if (!intentTag) return;
    setBusy(true);
    try {
      await homeRequest('POST', '/api/user/availability-intents', { intent_tag: intentTag, durationMs });
      toast.success('You’re free — Clicks can see it');
      setTag('');
      onOpenChange(false);
      onShared();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t update your availability.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="I’m free for…"
      description="Visible to your Clicks until it expires."
      footer={
        <Button type="submit" form="availability-form" fullWidth size="lg" loading={busy} disabled={!tag.trim()}>
          Share
        </Button>
      }
    >
      <form id="availability-form" onSubmit={onSubmit} className="flex flex-col gap-5">
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
            {AVAILABILITY_INTENT_DURATION_PRESETS.filter((p) => QUICK_PRESETS.includes(p.label) || p.ms === durationMs).map((p) => (
              <Chip key={p.label} selected={durationMs === p.ms} onClick={() => setDurationMs(p.ms)}>
                {p.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}
