'use client';

import { useState } from 'react';
import { BarChart3, Map, MapPin } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import type { LocationPrefs } from '@/lib/server/settings/loadSettings';
import { getSupabaseClient } from '@/lib/supabase';
import { ToggleList, ToggleRow } from './ToggleRows';

const LOCATION_ROWS: { key: keyof LocationPrefs; icon: typeof MapPin; title: string; description: string }[] = [
  {
    key: 'location_connection_snap_enabled',
    icon: MapPin,
    title: 'Where you Click',
    description: 'Saves your location at the moment you Click with someone. Never continuous tracking.',
  },
  {
    key: 'location_show_on_map_enabled',
    icon: Map,
    title: 'Show on my map',
    description: 'Puts those places on your own map. Only you see it.',
  },
  {
    key: 'location_include_in_insights_enabled',
    icon: BarChart3,
    title: 'Count me in Place totals',
    description: 'Lets Places see anonymous totals that include you. Never your name.',
  },
];

/** Privacy & location (spec §7.8): location toggles save at once; phone discovery is its own form. */
export function PrivacySettings({ userId, initial, phone }: { userId: string; initial: LocationPrefs; phone: string | null }) {
  const [prefs, setPrefs] = useState(initial);
  const [savedPhone, setSavedPhone] = useState(phone ?? '');
  const [phoneDraft, setPhoneDraft] = useState(phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const onToggle = async (key: keyof LocationPrefs, on: boolean) => {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: on });
    const { error } = (await getSupabaseClient()?.from('users').update({ [key]: on }).eq('id', userId)) ?? { error: null };
    if (error) {
      setPrefs(previous);
      toast.error('Couldn’t save that change.');
    }
  };

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneDraft.trim()) return;
    setBusy('save');
    setPhoneError(null);
    try {
      const res = await authedJson<{ phone: string | null }>('/api/me/phone', {
        method: 'PUT',
        body: { phone: phoneDraft.trim() },
        fallback: 'Couldn’t save that number.',
      });
      setSavedPhone(res.phone ?? '');
      setPhoneDraft(res.phone ?? '');
      toast.success('Number saved');
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Couldn’t save that number.');
    } finally {
      setBusy(null);
    }
  };

  const removePhone = async () => {
    const ok = await confirm({
      title: 'Remove your number?',
      message: 'Friends who have your number in their contacts won’t be able to find you with it.',
      confirmLabel: 'Remove number',
      cancelLabel: 'Keep number',
      destructive: true,
    });
    if (!ok) return;
    setBusy('remove');
    try {
      await authedJson('/api/me/phone', { method: 'DELETE', fallback: 'Couldn’t remove your number.' });
      setSavedPhone('');
      setPhoneDraft('');
      toast.success('Number removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t remove your number.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <ToggleList header="Location" footer="Ghost mode in the app pauses all of these while it’s on.">
        {LOCATION_ROWS.map((r) => (
          <ToggleRow
            key={r.key}
            icon={r.icon}
            title={r.title}
            description={r.description}
            checked={prefs[r.key]}
            onChange={(on) => void onToggle(r.key, on)}
          />
        ))}
      </ToggleList>

      <section aria-labelledby="privacy-phone">
        <h2 id="privacy-phone" className="type-headline text-fg">
          Find me by phone number
        </h2>
        <p className="type-meta mt-1 max-w-[56ch] text-fg-secondary">
          Friends who have your number in their contacts can find you on Click. It’s stored as a one-way hash and never shown to
          anyone.
        </p>
        <form onSubmit={savePhone} className="mt-4 flex flex-wrap items-end gap-2">
          <TextField
            label="Phone number"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+1 206 555 0100"
            value={phoneDraft}
            onChange={(e) => {
              setPhoneDraft(e.target.value);
              setPhoneError(null);
            }}
            error={phoneError}
            className="min-w-56 flex-1"
          />
          <Button type="submit" variant="secondary" loading={busy === 'save'} disabled={!phoneDraft.trim() || phoneDraft.trim() === savedPhone}>
            Save
          </Button>
          {savedPhone ? (
            <Button variant="plain" className="text-destructive" loading={busy === 'remove'} onClick={() => void removePhone()}>
              Remove
            </Button>
          ) : null}
        </form>
      </section>
      {confirmDialog}
    </div>
  );
}
