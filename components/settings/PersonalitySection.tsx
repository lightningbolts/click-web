'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { Save, Sparkles } from 'lucide-react';
import {
  PERSONALITY_REQUIRED_TAG_COUNT,
  PERSONALITY_TRAITS,
  canonicalizePersonalityTags,
} from '@/lib/personality/taxonomy';

export default function PersonalitySection() {
  const { user } = useAuth();
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [personalityDirty, setPersonalityDirty] = useState(false);
  const [personalityLoading, setPersonalityLoading] = useState(false);
  const [personalityMessage, setPersonalityMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('personality_tags')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) return;
      const loaded = Array.isArray(data?.personality_tags)
        ? canonicalizePersonalityTags(data.personality_tags as string[])
        : [];
      setPersonalityTags(loaded);
      setPersonalityDirty(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const togglePersonality = (trait: string) => {
    setPersonalityTags((prev) => {
      const canonical = canonicalizePersonalityTags(prev);
      const next = canonical.includes(trait)
        ? canonical.filter((t) => t !== trait)
        : canonical.length < PERSONALITY_REQUIRED_TAG_COUNT
          ? [...canonical, trait]
          : canonical;
      setPersonalityDirty(true);
      return next;
    });
  };

  const handleSavePersonality = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    const toSave = canonicalizePersonalityTags(personalityTags);
    if (toSave.length !== PERSONALITY_REQUIRED_TAG_COUNT) {
      setPersonalityMessage({
        type: 'error',
        text: `Pick exactly ${PERSONALITY_REQUIRED_TAG_COUNT} traits.`,
      });
      return;
    }
    setPersonalityLoading(true);
    setPersonalityMessage({ type: '', text: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setPersonalityMessage({ type: 'error', text: 'Session expired. Sign in again.' });
        return;
      }
      const res = await fetch(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ personality_tags: toSave }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPersonalityMessage({
          type: 'error',
          text: typeof body.error === 'string' ? body.error : 'Could not save personality traits.',
        });
        return;
      }
      setPersonalityTags(toSave);
      setPersonalityDirty(false);
      setPersonalityMessage({ type: 'success', text: `Saved ${PERSONALITY_REQUIRED_TAG_COUNT} personality traits.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      setPersonalityMessage({ type: 'error', text: message });
    } finally {
      setPersonalityLoading(false);
    }
  };

  return (
    <div className="fc-card p-8 rounded-[16px] border border-border-hard">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-[#630ed4]/10 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-[#630ed4]" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Personality</h3>
          <p className="text-on-surface-variant text-sm">
            Pick exactly {PERSONALITY_REQUIRED_TAG_COUNT} traits.
          </p>
        </div>
      </div>
      <p className="mb-3 text-xs text-on-surface-variant">
        {personalityTags.length} of {PERSONALITY_REQUIRED_TAG_COUNT} selected
      </p>
      <div className="flex flex-wrap gap-2">
        {PERSONALITY_TRAITS.map((trait) => {
          const selected = personalityTags.includes(trait);
          const disabled = !selected && personalityTags.length >= PERSONALITY_REQUIRED_TAG_COUNT;
          return (
            <button
              key={trait}
              type="button"
              disabled={disabled}
              onClick={() => togglePersonality(trait)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                selected
                  ? 'border-[#630ed4] bg-[#630ed4]/15 text-[#630ed4]'
                  : 'border-border-hard text-on-surface hover:bg-surface-container disabled:opacity-40'
              }`}
            >
              {trait}
            </button>
          );
        })}
      </div>
      {personalityMessage.text && (
        <div className={`mt-4 p-3 rounded-xl text-sm ${personalityMessage.type === 'error'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
            : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          }`}>
          {personalityMessage.text}
        </div>
      )}
      <button
        onClick={() => { void handleSavePersonality(); }}
        disabled={personalityLoading || !personalityDirty || personalityTags.length !== PERSONALITY_REQUIRED_TAG_COUNT}
        className="mt-4 flex items-center gap-2 px-6 py-3 bg-[#630ed4] hover:bg-[#732ee4] rounded-xl font-semibold transition-colors disabled:opacity-50"
      >
        {personalityLoading ? 'Saving...' : (
          <>
            <Save className="w-4 h-4" />
            {personalityDirty ? 'Save personality' : 'Saved'}
          </>
        )}
      </button>
    </div>
  );
}
