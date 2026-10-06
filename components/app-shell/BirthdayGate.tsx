'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { TextField } from '@/components/ds/TextField';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { ageFromBirthday } from '@/lib/userProfile/profileDisplay';

/**
 * Accounts created with a social sign-in have no birthday yet. Click is 13+, so this stays open
 * (no close, no Esc, no outside click) until one is saved.
 */
export function BirthdayGate({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const { mutate } = useSWRConfig();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const save = async () => {
    setError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setError('Enter your date of birth.');
      return;
    }
    const age = ageFromBirthday(value);
    if (age == null || age < 13) {
      setError('You must be at least 13 to use Click.');
      return;
    }
    setBusy(true);
    try {
      const path = `/api/users/${encodeURIComponent(userId)}/profile`;
      const res = await fetch(path, {
        method: 'PATCH',
        headers: { ...(await getFreshAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === 'string' && json.error.trim() ? json.error : 'Couldn’t save. Try again.');
      await mutate(path);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      hideClose
      title="Add your birthday"
      description="Click is for people 13 and older. Your birthday isn’t shown to anyone."
      footer={
        <Button fullWidth loading={busy} disabled={!value} onClick={() => void save()}>
          Save birthday
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label="Birthday" type="date" autoComplete="bday" max={today} value={value} onChange={(e) => setValue(e.target.value)} />
      </form>
      {error ? (
        <InlineNotice variant="destructive" live className="mt-3">
          {error}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}
