'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from '@/components/ds/Toast';
import { InterestPicker, missingInterests } from '@/components/interests/InterestPicker';
import { authedJson } from '@/lib/api/authedJson';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { SettingsSaveBar } from './SettingsSaveBar';

const FORM_ID = 'settings-interests-form';
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

/**
 * Interests (spec §7.8): a category list with emoji, a count of picks and a disclosure, chips
 * inside each, plus your own. "Pick N more" until the minimum is met.
 */
export function InterestsSettings({ userId, initial }: { userId: string; initial: string[] }) {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [saved, setSaved] = useState(initial);
  const [tags, setTags] = useState(initial);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authedJson(`/api/users/${userId}/profile`, { method: 'PATCH', body: { tags }, fallback: 'Couldn’t save your interests.' });
      // Keep the change history the apps read from auth metadata.
      const history = Array.isArray(user?.user_metadata?.interest_history) ? user.user_metadata.interest_history : [];
      await getSupabaseClient()?.auth.updateUser({
        data: { interest_history: [...history, { previous: saved, updated: tags, at: new Date().toISOString() }].slice(-50) },
      });
      setSaved(tags);
      void refreshUser();
      router.refresh();
      toast.success('Interests saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save your interests.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id={FORM_ID} onSubmit={onSubmit}>
      <InterestPicker tags={tags} onChange={setTags} />
      <SettingsSaveBar
        formId={FORM_ID}
        dirty={!sameSet(tags, saved)}
        saving={saving}
        disabled={missingInterests(tags) > 0}
        onDiscard={() => setTags(saved)}
      />
    </form>
  );
}
