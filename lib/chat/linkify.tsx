'use client';

import type { ReactNode } from 'react';

/**
 * Detects http(s) URLs and renders them as external links.
 * Trailing punctuation that is unlikely to be part of the URL is stripped from the href.
 */
const URL_RE =
  /\b(https?:\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;]*[-A-Za-z0-9+&@#/%=~_|])/gi;

function trimTrailingPunctuation(href: string): string {
  return href.replace(/[),.;:!?]+$/u, '');
}

export interface LinkifiedTextProps {
  text: string;
  className?: string;
  /** Mine bubble: light links on purple. Theirs: accent on glass. */
  variant: 'mine' | 'theirs';
}

export function LinkifiedText({ text, className = '', variant }: LinkifiedTextProps): ReactNode {
  const linkClass =
    variant === 'mine'
      ? 'text-on-primary underline decoration-white/60 underline-offset-2 hover:decoration-white'
      : 'text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary';

  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t-${key++}`}>{text.slice(last, m.index)}</span>);
    }
    const raw = m[1];
    const href = trimTrailingPunctuation(raw);
    parts.push(
      <a
        key={`a-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${linkClass} break-all`}
      >
        {raw}
      </a>,
    );
    last = m.index + raw.length;
  }
  if (last < text.length) {
    parts.push(<span key={`t-${key++}`}>{text.slice(last)}</span>);
  }
  if (parts.length === 0) return <span className={className}>{text}</span>;
  return <span className={className}>{parts}</span>;
}
