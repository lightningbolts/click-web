'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/ds/IconButton';
import { TextField } from '@/components/ds/TextField';
import type { Message } from '@/lib/chat/types';
import { isAnyE2eeWireContent } from '@/lib/chat/crypto';

function searchableText(m: Message): string {
  if (m.message_type !== 'text' && m.message_type !== 'image') return '';
  const content = typeof m.content === 'string' ? m.content : '';
  // Ciphertext that hasn't decrypted yet isn't searchable.
  return isAnyE2eeWireContent(content) ? '' : content;
}

/**
 * Find in this conversation (spec §7.2). Searches the messages already decrypted on this device,
 * newest match first; ↑/↓ or Enter/Shift-Enter step through, Escape closes.
 */
export function ThreadSearchBar({
  messages,
  onJump,
  onClose,
}: {
  messages: Message[];
  onJump: (messageId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  /** False until the first jump for this query, so Enter lands on the newest match first. */
  const [landed, setLanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return messages.filter((m) => searchableText(m).toLowerCase().includes(q)).map((m) => m.id).reverse();
  }, [messages, query]);

  const current = matches.length ? Math.min(index, matches.length - 1) : -1;
  const step = (delta: number) => {
    if (!matches.length) return;
    const next = landed ? (current + delta + matches.length) % matches.length : 0;
    setLanded(true);
    setIndex(next);
    onJump(matches[next]);
  };

  return (
    <div className="flex items-center gap-1 rounded-md bg-bg-elevated p-1.5 shadow-overlay">
      <TextField
        ref={inputRef}
        label="Search this conversation"
        hideLabel
        type="search"
        placeholder="Search this conversation"
        value={query}
        className="min-w-0 flex-1"
        inputClassName="h-9"
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setLanded(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      />
      <span className="type-meta tabular w-16 shrink-0 text-center text-fg-tertiary" aria-live="polite">
        {query.trim().length < 2 ? '' : matches.length ? `${current + 1} of ${matches.length}` : 'No results'}
      </span>
      <IconButton icon={ChevronUp} aria-label="Older match" size="sm" disabled={!matches.length} onClick={() => step(1)} />
      <IconButton icon={ChevronDown} aria-label="Newer match" size="sm" disabled={!matches.length} onClick={() => step(-1)} />
      <IconButton icon={X} aria-label="Close search" size="sm" onClick={onClose} />
    </div>
  );
}
