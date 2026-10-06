'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { TextArea, TextField } from '@/components/ds/TextField';
import { personHref } from '@/lib/shell/appNav';

const REPORT_MAX = 1000;

/**
 * Report a connection (spec §7.2 row menu, §7.3). Replaces the old `window.confirm`
 * double-step: the dialog itself is the confirmation.
 */
export function ReportDialog({
  name,
  open,
  onOpenChange,
  onSubmit,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<boolean> | boolean;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setReason('');
      setError('');
    }
    onOpenChange(next);
  };

  const submit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      const ok = await onSubmit(trimmed);
      if (ok) {
        setBusy(false);
        close(false);
        return;
      }
      setError('Couldn’t send the report. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={`Report ${name}`}
      description="Tell us what happened. Reports are private and reviewed by our team."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="plain" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive-solid" loading={busy} disabled={!reason.trim()} onClick={() => void submit()}>
            Send report
          </Button>
        </div>
      }
    >
      <TextArea
        label="What happened?"
        value={reason}
        maxLength={REPORT_MAX}
        rows={4}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      {error ? (
        <InlineNotice variant="destructive" live className="mt-3">
          {error}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}

/** Rename a verified group. */
export function RenameGroupDialog({
  initialName,
  open,
  onOpenChange,
  onSubmit,
}: {
  initialName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || trimmed === initialName) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(trimmed);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t rename the group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title="Edit group name"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="plain" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!trimmed || trimmed === initialName} onClick={() => void submit()}>
            Save
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField label="Group name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
      </form>
      {error ? (
        <InlineNotice variant="destructive" live className="mt-3">
          {error}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}

/** A verified group's members; each opens their profile route. */
export function MembersDialog({
  open,
  onOpenChange,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { userId: string; label: string }[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Members" description={`${members.length} people`}>
      <ul className="-mx-2 max-h-[min(50vh,360px)] overflow-y-auto">
        {members.map((m) => (
          <li key={m.userId}>
            <Link
              href={personHref(m.userId)}
              onClick={() => onOpenChange(false)}
              className="flex h-14 items-center gap-3 rounded-md px-2 hover:bg-hover"
            >
              <Avatar seed={m.userId} name={m.label} size={40} />
              <span className="type-body-strong truncate text-fg">{m.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
