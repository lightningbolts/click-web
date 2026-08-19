'use client';

import { Link as LinkIcon } from 'lucide-react';
import type { LinkItem } from '@/lib/userProfile/profileModalTypes';
import { EmptyTabState } from '@/components/userProfile/ProfileModalPrimitives';

export function LinksTab({
  linkItems,
  chatMessagesLoading,
}: {
  linkItems: LinkItem[];
  chatMessagesLoading: boolean;
}) {
  return (
    <section role="tabpanel" aria-label="Links">
      {linkItems.length === 0 && chatMessagesLoading ? (
        <EmptyTabState
          Icon={LinkIcon}
          title="Loading shared links"
          body="Scanning chat history for URLs."
        />
      ) : linkItems.length === 0 ? (
        <EmptyTabState
          Icon={LinkIcon}
          title="No shared links"
          body="URLs shared in chat show up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {linkItems.map((l) => (
            <li key={l.id}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5 text-sm text-on-surface hover:border-primary"
              >
                <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-primary">{l.url}</p>
                  <p className="mt-0.5 text-[11px] text-on-surface-variant">{l.timestamp}</p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
