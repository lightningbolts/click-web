'use client';

import { useRef, useState } from 'react';
import { FcButton, FcField, FcInput } from '@/components/fc';
import { FcDialog } from '@/components/fc/FcDialog';
import { makePlan, planSummary, type HangoutPlan } from '@/lib/chat/plans';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The next whole hour at least 30 minutes away (iOS `PlanHangoutSheet.defaultStart`). */
export function defaultPlanStart(now = new Date()): Date {
  const start = new Date(now.getTime() + 30 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return start;
}

function localMs(date: string, time: string): number | null {
  if (!date || !time) return null;
  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const QUICK_DAYS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'This weekend', offset: -1 },
] as const;

function weekendDay(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const add = day === 6 || day === 0 ? 0 : 6 - day;
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * "Plan a hangout": a titled time (and optional place) sent into the conversation as a plan
 * card everyone can RSVP to. Same fields as iOS `PlanHangoutSheet`, laid out for a pointer.
 */
export function PlanDialog({
  open,
  onOpenChange,
  withName,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** First name for a direct chat ("Plan something with Maya"); omitted for groups. */
  withName?: string | null;
  onSend: (plan: HangoutPlan) => Promise<boolean>;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const initialStart = defaultPlanStart();
  const [date, setDate] = useState(() => dateInputValue(initialStart));
  const [start, setStart] = useState(() => timeInputValue(initialStart));
  const [end, setEnd] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startsAt = localMs(date, start);
  const endsAt = end ? localMs(date, end) : null;
  const plan =
    title.trim() && startsAt != null
      ? makePlan({ title, startsAt, endsAt: endsAt != null && endsAt > startsAt ? endsAt : null, placeName: place })
      : null;

  const reset = () => {
    const next = defaultPlanStart();
    setTitle('');
    setDate(dateInputValue(next));
    setStart(timeInputValue(next));
    setEnd('');
    setPlace('');
    setError(null);
  };

  const submit = async () => {
    if (!plan || busy) return;
    if (plan.startsAt < Date.now() - 60_000) {
      setError('Pick a time that has not passed yet.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSend(plan);
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      reset();
    } else {
      setError('Could not send the plan. Try again.');
    }
  };

  const setDay = (offset: number) => {
    const now = new Date();
    const d = offset < 0 ? weekendDay(now) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    setDate(dateInputValue(d));
  };

  return (
    <FcDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Plan a hangout"
      description={withName ? `Pick a time with ${withName}. They can RSVP right in the chat.` : 'Pick a time. Everyone can RSVP right in the chat.'}
      initialFocusRef={titleRef}
      testId="plan-dialog"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FcField label="What">
          <FcInput
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Coffee, climbing, study session…"
            maxLength={80}
            required
          />
        </FcField>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick day">
            {QUICK_DAYS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setDay(d.offset)}
                className="inline-flex h-9 items-center rounded-full border border-border-hard px-3 text-sm font-semibold text-on-surface hover:bg-surface-container-low"
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FcField label="Day" className="col-span-2">
              <FcInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </FcField>
            <FcField label="Starts">
              <FcInput type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            </FcField>
            <FcField label="Ends (optional)">
              <FcInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </FcField>
          </div>
        </div>
        <FcField label="Where (optional)">
          <FcInput value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place or address" maxLength={120} />
        </FcField>
        {plan ? (
          <p className="rounded-[12px] border border-border-hard bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
            {planSummary(plan)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <FcButton variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </FcButton>
          <FcButton type="submit" disabled={!plan || busy}>
            {busy ? 'Sending…' : 'Send plan'}
          </FcButton>
        </div>
      </form>
    </FcDialog>
  );
}
