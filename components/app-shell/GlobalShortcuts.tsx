'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ds/Dialog';
import { CommandPalette, isTypingTarget } from './CommandPalette';

/** "G then …" destinations (spec §10.10). */
export const GO_TO: Record<string, { href: string; label: string }> = {
  h: { href: '/', label: 'Home' },
  c: { href: '/clicks', label: 'Clicks' },
  e: { href: '/events', label: 'Events' },
  m: { href: '/map', label: 'Map' },
};

const CHORD_MS = 1200;

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Search' },
  { keys: ['/'], label: 'Search' },
  ...Object.entries(GO_TO).map(([k, v]) => ({ keys: ['G', k.toUpperCase()], label: `Go to ${v.label}` })),
  { keys: ['Esc'], label: 'Close' },
  { keys: ['?'], label: 'Show shortcuts' },
];

/**
 * Signed-in keyboard layer (spec §10.10): the command palette, "G" chords and a "?" list of
 * shortcuts. Ignores keys typed into fields.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const chordAt = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (Date.now() - chordAt.current < CHORD_MS && GO_TO[key]) {
        e.preventDefault();
        chordAt.current = 0;
        router.push(GO_TO[key].href);
        return;
      }
      chordAt.current = key === 'g' ? Date.now() : 0;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  return (
    <>
      <CommandPalette />
      <Dialog open={help} onOpenChange={setHelp} title="Keyboard shortcuts" size="sm">
        <dl className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <div key={s.keys.join('+') + s.label} className="flex h-10 items-center justify-between gap-4 shadow-[inset_0_-1px_0_var(--hairline)] last:shadow-none">
              <dt className="type-body text-fg">{s.label}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="type-meta inline-flex h-6 min-w-6 items-center justify-center rounded-xs bg-fill-subtle px-1.5 font-semibold text-fg-secondary">
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
}
