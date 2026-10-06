'use client';

import { useState } from 'react';
import { Chip } from '@/components/ds/Chip';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import { PERSONALITY_GROUPS } from '@/lib/personality/groups';
import { PERSONALITY_REQUIRED_TAG_COUNT as REQUIRED } from '@/lib/personality/taxonomy';
import { SettingsSaveBar } from './SettingsSaveBar';

const FORM_ID = 'settings-personality-form';

/** Personality (spec §7.8): exactly five traits, grouped, with a running "3 of 5". */
export function PersonalitySettings({ userId, initial }: { userId: string; initial: string[] }) {
  const [saved, setSaved] = useState(initial);
  const [picked, setPicked] = useState(initial);
  const [saving, setSaving] = useState(false);
  const full = picked.length >= REQUIRED;
  const dirty = picked.length !== saved.length || picked.some((t) => !saved.includes(t));

  const toggle = (t: string) =>
    setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < REQUIRED ? [...cur, t] : cur));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authedJson(`/api/users/${userId}/profile`, {
        method: 'PATCH',
        body: { personality_tags: picked },
        fallback: 'Couldn’t save your traits.',
      });
      setSaved(picked);
      toast.success('Personality saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save your traits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id={FORM_ID} onSubmit={onSubmit}>
      <p className="type-body-strong tabular mb-5 text-fg" aria-live="polite">
        {picked.length} of {REQUIRED}
        {full ? null : <span className="type-meta ml-2 font-normal text-fg-tertiary">Pick {REQUIRED - picked.length} more</span>}
      </p>
      <div className="flex flex-col gap-6">
        {PERSONALITY_GROUPS.map((group) => (
          <fieldset key={group.label}>
            <legend className="type-meta mb-2 font-semibold text-fg-secondary">{group.label}</legend>
            <div className="flex flex-wrap gap-2">
              {group.traits.map((t) => {
                const selected = picked.includes(t);
                return (
                  <Chip key={t} selected={selected} showCheck disabled={!selected && full} onClick={() => toggle(t)}>
                    {t}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <SettingsSaveBar
        formId={FORM_ID}
        dirty={dirty}
        saving={saving}
        disabled={picked.length !== REQUIRED}
        onDiscard={() => setPicked(saved)}
      />
    </form>
  );
}
