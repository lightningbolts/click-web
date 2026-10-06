'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { Dialog } from '@/components/ds/Dialog';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';

const PASSWORD_MIN = 6;

function PasswordForm() {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`);
    if (next !== again) return setError('The passwords don’t match.');
    setSaving(true);
    setError(null);
    const { error: authError } = (await getSupabaseClient()?.auth.updateUser({ password: next })) ?? { error: null };
    setSaving(false);
    if (authError) return setError(authError.message);
    setNext('');
    setAgain('');
    toast.success('Password changed');
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        error={error}
      />
      <Button type="submit" variant="secondary" loading={saving} disabled={!next || !again} className="self-start">
        Change password
      </Button>
    </form>
  );
}

function DeleteAccountDialog({ open, onOpenChange, name }: { open: boolean; onOpenChange: (o: boolean) => void; name: string }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = name.length > 0 && typed.trim() === name;

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await authedJson('/api/user/delete', { method: 'DELETE', fallback: 'Couldn’t delete your account.' });
      await signOut();
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete your account.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
        if (!o) setTyped('');
      }}
      title="Delete your account?"
      size="sm"
      initialFocusSelector="[data-delete-keep]"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy} data-delete-keep>
            Keep my account
          </Button>
          <Button variant="destructive-solid" onClick={() => void onDelete()} disabled={!matches} loading={busy}>
            Delete account
          </Button>
        </>
      }
    >
      <p className="type-body text-fg-secondary">
        This permanently deletes your profile, Clicks and messages. It can’t be undone.
      </p>
      {name ? (
        <TextField
          className="mt-4"
          label={`Type ${name} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
      ) : (
        <InlineNotice variant="warning" className="mt-4">
          Add your name in Profile first, so you can confirm.
        </InlineNotice>
      )}
      {error ? (
        <InlineNotice variant="destructive" className="mt-4">
          {error}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}

/** Account (spec §7.8): email, password, sign out everywhere, and the danger zone. */
export function AccountSettings({ email, name }: { email: string | null; name: string }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: 'Sign out everywhere?',
      message: 'You’ll be signed out on every browser and phone, including this one.',
      confirmLabel: 'Sign out everywhere',
      cancelLabel: 'Stay signed in',
    });
    if (!ok) return;
    const { error } = (await getSupabaseClient()?.auth.signOut({ scope: 'global' })) ?? { error: null };
    if (error) return void toast.error('Couldn’t sign out everywhere. Try again.');
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-10">
      <ListGroup header="Sign-in">
        <ListRow title="Email" trailing={email ?? 'Not set'} />
      </ListGroup>

      <section aria-labelledby="account-password">
        <h2 id="account-password" className="type-headline mb-4 text-fg">
          Password
        </h2>
        <PasswordForm />
      </section>

      <ListGroup header="Sessions" footer="Use this if you signed in on a computer that isn’t yours.">
        <ListRow icon={LogOut} title="Sign out everywhere" onClick={() => void signOutEverywhere()} />
      </ListGroup>

      <ListGroup header="Danger zone">
        <ListRow icon={Trash2} title="Delete account" destructive onClick={() => setDeleting(true)} />
      </ListGroup>

      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} name={name} />
      {confirmDialog}
    </div>
  );
}
