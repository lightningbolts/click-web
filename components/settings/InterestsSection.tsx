'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSupabaseClient } from '@/lib/supabase';
import { Save, Tag, Plus, X } from 'lucide-react';
import { InterestGrid, INTEREST_CATEGORIES } from '@/components/InterestTagging';

export default function InterestsSection() {
  const { user, refreshUser } = useAuth();
  const [tags, setTags] = useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsMessage, setTagsMessage] = useState({ type: '', text: '' });
  const [tagsDirty, setTagsDirty] = useState(false);
  const [customInterestInput, setCustomInterestInput] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) return;
      if (data?.tags && Array.isArray(data.tags)) {
        setTags(data.tags);
      } else {
        setTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggleTag = (tag: string) => {
    const next = tags.includes(tag)
      ? tags.filter((t) => t !== tag)
      : [...tags, tag];
    setTags(next);
    setTagsDirty(true);
  };

  const addCustomInterest = () => {
    const raw = customInterestInput.trim();
    if (!raw) return;
    const exists = tags.some((t) => t.toLowerCase() === raw.toLowerCase());
    if (!exists) {
      setTags([...tags, raw]);
      setTagsDirty(true);
    }
    setCustomInterestInput('');
  };

  const removeCustomInterest = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
    setTagsDirty(true);
  };

  const predefinedTags = new Set(
    INTEREST_CATEGORIES.flatMap((category) => [category.label, ...category.subs]).map((t) => t.toLowerCase())
  );
  const customSelectedTags = tags.filter((tag) => !predefinedTags.has(tag.toLowerCase()));

  const handleSaveTags = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;

    setTagsLoading(true);
    setTagsMessage({ type: '', text: '' });

    try {
      const { data: prior, error: priorErr } = await supabase
        .from('user_interests')
        .select('tags')
        .eq('user_id', user.id)
        .maybeSingle();
      if (priorErr) {
        setTagsMessage({ type: 'error', text: priorErr.message });
        return;
      }
      const previousTags = prior?.tags && Array.isArray(prior.tags) ? prior.tags : [];

      const existingHistory = user.user_metadata?.interest_history || [];
      const historyEntry = {
        previous: previousTags,
        updated: tags,
        at: new Date().toISOString(),
      };
      const interest_history = [...existingHistory, historyEntry].slice(-50);

      const updatedAt = Date.now();
      const { error: rowErr } = await supabase.from('user_interests').upsert(
        { user_id: user.id, tags, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );

      if (rowErr) {
        setTagsMessage({ type: 'error', text: rowErr.message });
        return;
      }

      const { error: authErr } = await supabase.auth.updateUser({
        data: { interest_history },
      });

      if (authErr) {
        setTagsMessage({ type: 'error', text: authErr.message });
      } else {
        await refreshUser();
        setTagsDirty(false);
        setTagsMessage({ type: 'success', text: `Saved ${tags.length} interests!` });
      }
    } catch (err: any) {
      setTagsMessage({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setTagsLoading(false);
    }
  };

  return (
    <div className="fc-card p-8 rounded-[16px] border border-border-hard">
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Tag className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold">My Interests</h3>
          <p className="text-on-surface-variant text-sm">
            Select categories/subcategories and add your own custom interests.
          </p>
        </div>
      </div>

      {/* Current tags summary */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5 mt-4">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <InterestGrid
        selected={tags}
        expandedCategory={expandedCategory}
        onToggleTag={toggleTag}
        onToggleExpand={(cat) => setExpandedCategory(expandedCategory === cat ? null : cat)}
        maxTags={undefined}
      />

      <div className="mt-5 space-y-2">
        <p className="text-xs uppercase tracking-wide text-on-surface-variant">Custom interests</p>
        <div className="flex gap-2">
          <input
            value={customInterestInput}
            onChange={(e) => setCustomInterestInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomInterest();
              }
            }}
            placeholder="Add your own interest"
            className="flex-1 rounded-lg border border-border-hard bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary"
          />
          <button
            onClick={addCustomInterest}
            disabled={customInterestInput.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-3 py-2 text-sm text-primary hover:bg-primary/15 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {customSelectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {customSelectedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-lg border border-secondary/35 bg-secondary/10 px-2 py-1 text-xs text-primary"
              >
                {tag}
                <button
                  onClick={() => removeCustomInterest(tag)}
                  className="rounded p-0.5 hover:bg-surface-container"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {tagsMessage.text && (
        <div className={`mt-4 p-3 rounded-xl text-sm ${tagsMessage.type === 'error'
            ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20'
            : 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
          }`}>
          {tagsMessage.text}
        </div>
      )}

      <button
        onClick={handleSaveTags}
        disabled={tagsLoading || !tagsDirty}
        className="mt-4 flex items-center gap-2 px-6 py-3 bg-primary hover:brightness-110 rounded-xl font-semibold transition-colors disabled:opacity-50"
      >
        {tagsLoading ? (
          'Saving...'
        ) : (
          <>
            <Save className="w-4 h-4" />
            {tagsDirty ? 'Save Interests' : 'Saved'}
          </>
        )}
      </button>
    </div>
  );
}
