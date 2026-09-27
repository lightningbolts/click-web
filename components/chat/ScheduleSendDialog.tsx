'use client';

import { useState } from 'react';
import { FcButton, FcField, FcInput } from '@/components/fc';
import { FcDialog } from '@/components/fc/FcDialog';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Preset send times (tonight / tomorrow morning / next Monday), skipping any in the past. */
export function schedulePresets(now = new Date()): { label: string; at: Date }[] {
  const at = (d: Date, h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return [
    { label: 'Later today', at: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
    { label: 'Tonight', at: at(now, 20) },
    { label: 'Tomorrow morning', at: at(tomorrow, 9) },
    { label: 'Monday morning', at: at(monday, 9) },
  ].filter((p) => p.at.getTime() > now.getTime() + 5 * 60 * 1000);
}

function formatAt(d: Date): string {
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Schedule the composer's text (iOS `ScheduleSendSheet`). The message is encrypted now and
 * delivered by the server at `send_at`, exactly as if it were sent then.
 */
export function ScheduleSendDialog({
  open,
  onOpenChange,
  preview,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: string;
  onSchedule: (sendAt: number) => Promise<boolean>;
}) {
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Presets are relative to when the dialog opens (refreshed on each open, during render).
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpenedAt(new Date());
      setError(null);
    }
  }
  const presets = schedulePresets(openedAt);

  const schedule = async (at: number) => {
    if (busy) return;
    if (at <= Date.now() + 60_000) {
      setError('Pick a time at least a minute from now.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSchedule(at);
    setBusy(false);
    if (ok) {
      setCustom('');
      onOpenChange(false);
    } else {
      setError('Could not schedule the message. Try again.');
    }
  };

  const now = openedAt;
  const minLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return (
    <FcDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule message"
      description="It stays encrypted and is delivered at the time you pick."
      size="sm"
      testId="schedule-dialog"
    >
      <p className="mb-4 line-clamp-3 rounded-[12px] border border-border-hard bg-surface-container-low px-3 py-2 text-sm text-on-surface">
        {preview}
      </p>
      <div className="grid gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={busy}
            onClick={() => void schedule(p.at.getTime())}
            className="flex min-h-11 items-center justify-between rounded-[8px] border border-border-hard px-3 text-left text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
          >
            <span>{p.label}</span>
            <span className="font-medium text-on-surface-variant">{formatAt(p.at)}</span>
          </button>
        ))}
      </div>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const ms = custom ? new Date(custom).getTime() : NaN;
          if (Number.isFinite(ms)) void schedule(ms);
        }}
      >
        <FcField label="Custom time">
          <FcInput type="datetime-local" min={minLocal} value={custom} onChange={(e) => setCustom(e.target.value)} />
        </FcField>
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <FcButton type="submit" className="w-full" disabled={!custom || busy}>
          {busy ? 'Scheduling…' : 'Schedule'}
        </FcButton>
      </form>
    </FcDialog>
  );
}
