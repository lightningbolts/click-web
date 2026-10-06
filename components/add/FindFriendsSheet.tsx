'use client';

import { useState } from 'react';
import { BookUser, Check, Lock } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Sheet } from '@/components/ds/Sheet';
import { StatusPill } from '@/components/ds/StatusPill';
import { TextArea } from '@/components/ds/TextField';
import { hashContacts } from '@/lib/contacts/contactHash';
import { homeRequest } from '@/lib/home/postHomeAction';

type Card = { id: string; name: string; avatar_url: string | null; tags: string[] };
type KnownCard = Card & { status: 'connected' | 'pending' };
type Result = { matches: Card[]; known: KnownCard[] };

type ContactsManager = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ email?: string[]; tel?: string[] }[]>;
};

function contactPicker(): ContactsManager | null {
  if (typeof navigator === 'undefined') return null;
  const c = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return c && typeof c.select === 'function' ? c : null;
}

/**
 * Find people you already know (spec §7.4). Emails and numbers are hashed in the browser;
 * only the hashes are sent. Adding someone sends a request they confirm.
 */
export function FindFriendsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'find' | string | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [requested, setRequested] = useState<Set<string>>(() => new Set());
  const picker = contactPicker();

  const find = async (entries: string[]) => {
    setBusy('find');
    setError('');
    try {
      const hashed_contacts = await hashContacts(entries);
      if (hashed_contacts.length === 0) {
        setError('Add at least one email address or phone number.');
        return;
      }
      const r = await homeRequest<Partial<Result>>('POST', '/api/contacts/discover', { hashed_contacts });
      setResult({ matches: r.matches ?? [], known: r.known ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t search. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    if (!picker) return;
    try {
      const picked = await picker.select(['email', 'tel'], { multiple: true });
      const entries = picked.flatMap((c) => [...(c.email ?? []), ...(c.tel ?? [])]);
      if (entries.length) await find(entries);
    } catch {
      /* the person closed the picker */
    }
  };

  const add = async (card: Card) => {
    setBusy(card.id);
    setError('');
    try {
      await homeRequest('POST', '/api/connections/prior/request', { target_user_id: card.id });
      setRequested((prev) => new Set(prev).add(card.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send the request.');
    } finally {
      setBusy(null);
    }
  };

  const close = (next: boolean) => {
    if (!next) {
      setResult(null);
      setText('');
      setError('');
    }
    onOpenChange(next);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title="Find friends"
      description="See which people you already know are on Click."
      footer={
        result ? (
          <Button variant="secondary" fullWidth onClick={() => setResult(null)}>
            Search again
          </Button>
        ) : (
          <Button fullWidth loading={busy === 'find'} disabled={!text.trim()} onClick={() => void find(text.split(/[\n,;]+/))}>
            Find friends
          </Button>
        )
      }
    >
      {result ? (
        result.matches.length === 0 && result.known.length === 0 ? (
          <p className="type-body py-6 text-center text-fg-secondary">None of them are on Click yet.</p>
        ) : (
          <ul className="-mx-2">
            {result.matches.map((m) => (
              <li key={m.id} className="flex h-16 items-center gap-3 px-2">
                <Avatar seed={m.id} name={m.name} src={m.avatar_url} size={40} />
                <span className="type-body-strong min-w-0 flex-1 truncate text-fg">{m.name}</span>
                {requested.has(m.id) ? (
                  <StatusPill variant="tinted" icon={Check}>
                    Requested
                  </StatusPill>
                ) : (
                  <Button size="sm" variant="tinted" loading={busy === m.id} disabled={busy !== null} onClick={() => void add(m)}>
                    Add
                  </Button>
                )}
              </li>
            ))}
            {result.known.map((m) => (
              <li key={m.id} className="flex h-16 items-center gap-3 px-2">
                <Avatar seed={m.id} name={m.name} src={m.avatar_url} size={40} />
                <span className="type-body-strong min-w-0 flex-1 truncate text-fg">{m.name}</span>
                <StatusPill variant="neutral">{m.status === 'connected' ? 'Connected' : 'Requested'}</StatusPill>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {picker ? (
            <Button variant="secondary" icon={BookUser} fullWidth onClick={() => void pick()} disabled={busy !== null}>
              Choose from contacts
            </Button>
          ) : null}
          <TextArea
            className={picker ? 'mt-4' : undefined}
            label="Emails or phone numbers"
            placeholder="One per line"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="type-meta mt-3 flex items-start gap-1.5 text-fg-tertiary">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
            They’re scrambled on this device before anything is sent. Click never sees or keeps them.
          </p>
        </>
      )}
      {error ? (
        <InlineNotice variant="destructive" live className="mt-3">
          {error}
        </InlineNotice>
      ) : null}
    </Sheet>
  );
}
