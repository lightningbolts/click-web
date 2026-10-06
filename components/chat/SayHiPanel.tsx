'use client';

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { Button } from '@/components/ds/Button';

const COOLDOWN_MS = 15_000;

/** Openers built from what you actually share: where you met and your common interests. */
export function sayHiOpeners(firstName: string, location: string | null | undefined, interests: string[]): string[] {
  const place = location?.trim();
  const pool = [
    place ? `Great meeting you at ${place}, ${firstName}!` : `Great meeting you, ${firstName}!`,
    place ? `What brought you to ${place}?` : 'What brought you there?',
    'Want to grab coffee this week?',
    ...interests.slice(0, 4).map((t) => `I saw we’re both into ${t.toLowerCase()}. How did you get into it?`),
    `Hey ${firstName}! How’s your week going?`,
    'Any plans for the weekend?',
    place ? `Do you go to ${place} often?` : 'Do you go there often?',
  ];
  return [...new Set(pool)];
}

/**
 * Shown on a new Click that hasn't had a first message yet (spec §7.2): how long is left before
 * it moves to Archived, and three openers that drop into the composer.
 */
export function SayHiPanel({
  hoursLeft,
  openers,
  onPick,
}: {
  hoursLeft: number;
  openers: string[];
  onPick: (text: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const t = window.setTimeout(() => setCooling(false), COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [cooling]);
  const pages = Math.max(1, Math.ceil(openers.length / 3));
  const start = (page % pages) * 3;
  const shown = openers.slice(start, start + 3);

  return (
    <section aria-label="Say hi" className="rounded-md bg-surface-raised p-4 shadow-overlay">
      <p className="type-meta flex items-center gap-1.5 font-semibold text-warning-text">
        <Hourglass size={14} aria-hidden />
        Say hi · {hoursLeft}h left before this Click moves to Archived
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((text) => (
          <li key={text}>
            <button
              type="button"
              onClick={() => onPick(text)}
              className="press type-body w-full rounded-md bg-fill-subtle px-3 py-2 text-left text-fg hover:bg-hover"
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <Button
          variant="plain"
          size="sm"
          className="mt-2 -ml-2"
          disabled={cooling}
          onClick={() => {
            setPage((p) => p + 1);
            setCooling(true);
          }}
        >
          New ideas
        </Button>
      ) : null}
    </section>
  );
}
