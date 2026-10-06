'use client';

import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { Chip } from '@/components/ds/Chip';
import { CountBadge } from '@/components/ds/CountBadge';
import { TextField } from '@/components/ds/TextField';
import { cn } from '@/lib/cn';
import { INTEREST_CATEGORIES, MIN_TAGS } from '@/lib/interests/categories';

const PREDEFINED = new Set(INTEREST_CATEGORIES.flatMap((c) => [c.label, ...c.subs]).map((t) => t.toLowerCase()));

export function missingInterests(tags: string[]): number {
  return Math.max(0, MIN_TAGS - tags.length);
}

/**
 * Interest picker (spec §7.8): a category list with emoji, a count of picks and a disclosure,
 * chips inside each, plus your own. Controlled; used by onboarding and Settings.
 */
export function InterestPicker({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) => onChange(has(t) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]);
  const customTags = tags.filter((t) => !PREDEFINED.has(t.toLowerCase()));
  const missing = missingInterests(tags);

  const addCustom = () => {
    const raw = custom.trim();
    if (raw && !has(raw)) onChange([...tags, raw]);
    setCustom('');
  };

  return (
    <div>
      <p className="type-meta mb-3 px-1 text-fg-secondary" aria-live="polite">
        {missing > 0 ? `Pick ${missing} more` : `${tags.length} picked`}
      </p>
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {INTEREST_CATEGORIES.map(({ emoji, label, subs }) => {
          const count = [label, ...subs].filter(has).length;
          const expanded = open === label;
          const panelId = `interest-${label.replace(/\W+/g, '-').toLowerCase()}`;
          return (
            <li key={label} className="shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : label)}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left hover:bg-hover"
              >
                <span aria-hidden className="w-7 text-center text-xl">
                  {emoji}
                </span>
                <span className="type-body-strong flex-1 text-fg">{label}</span>
                {count > 0 ? <CountBadge count={count} /> : null}
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={cn('text-fg-tertiary transition-transform duration-[var(--d-fast)]', expanded && 'rotate-180')}
                />
              </button>
              {expanded ? (
                <div id={panelId} className="flex flex-wrap gap-2 px-4 pb-4 pl-14">
                  {[label, ...subs.filter((s, i, all) => all.indexOf(s) === i)].map((t) => (
                    <Chip key={t} size="sm" selected={has(t)} showCheck onClick={() => toggle(t)}>
                      {t}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <TextField
            label="Add your own"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Something not listed"
            className="flex-1"
          />
          <Button variant="secondary" icon={Plus} onClick={addCustom} disabled={!custom.trim()}>
            Add
          </Button>
        </div>
        {customTags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your own interests">
            {customTags.map((t) => (
              <li key={t}>
                <Chip size="sm" selected onClick={() => toggle(t)} aria-label={`Remove ${t}`}>
                  {t}
                  <X size={14} aria-hidden />
                </Chip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
