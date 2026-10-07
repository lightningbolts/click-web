'use client';

import Link from 'next/link';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, Lock, MessageCircle, Plus, QrCode, ScanLine, Search, Users } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Chip } from '@/components/ds/Chip';
import { EmptyState } from '@/components/ds/EmptyState';
import { Skeleton } from '@/components/ds/Skeleton';
import { IconButton } from '@/components/ds/IconButton';
import { SearchField } from '@/components/ds/SearchField';
import { Tooltip } from '@/components/ds/Tooltip';
import type { ChatListConnection } from './types';
import type { ChatSearchHit } from '@/lib/chat/searchSnippet';
import { openCommandPalette } from '@/components/app-shell/commandPaletteEvents';
import { cn } from '@/lib/cn';
import type { ClicksFilter } from '@/lib/clicks/route';
import { InboxRow, type InboxRowActions, type InboxRowState } from './InboxRow';

const FILTERS: { id: ClicksFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'groups', label: 'Groups' },
  { id: 'hubs', label: 'Hubs' },
  { id: 'archived', label: 'Archived' },
];

const EMPTY: Record<Exclude<ClicksFilter, 'hubs'>, { icon: typeof Users; title: string; body: string }> = {
  active: {
    icon: MessageCircle,
    title: 'No connections yet',
    body: 'Clicks start in person. Open the Click app and tap phones, or share your QR.',
  },
  groups: {
    icon: Users,
    title: 'No groups yet',
    body: 'Start a verified group with people who have all Clicked with each other.',
  },
  archived: {
    icon: Archive,
    title: 'Nothing archived',
    body: "Clicks you didn't follow up on within 48 hours land here. You can still message them.",
  },
};

/** Rows at `InboxRow`'s exact size, shown until the first load says whether the list is empty. */
function InboxSkeleton() {
  return (
    <ul aria-busy aria-label="Loading conversations" className="route-loading">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <li key={i} className="px-2">
          <div className="flex h-[72px] items-center gap-3 px-3">
            <Skeleton rounded="full" className="size-12 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton rounded="sm" className="h-3.5 w-2/5" />
              <Skeleton rounded="sm" className="h-3.5 w-4/5" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Clicks inbox pane (spec §7.2): header, local search, filter chips with unread counts,
 * the Core strip, and the conversation rows. Keyboard: ↑/↓ move, Enter opens, E archives,
 * U marks unread, / focuses search.
 */
export function Inbox({
  viewerId,
  filter,
  onFilterChange,
  rows,
  loaded,
  unreadByFilter,
  core,
  rowState,
  nowMs,
  timeZone,
  actions,
  onlineUserIds,
  onNewGroup,
  search,
  onOpenSearchHit,
  hubs,
}: {
  viewerId: string;
  filter: ClicksFilter;
  onFilterChange: (filter: ClicksFilter) => void;
  rows: ChatListConnection[];
  /** The rows' first load finished: until then an empty list is unknown, not empty. */
  loaded: boolean;
  unreadByFilter: Partial<Record<ClicksFilter, number>>;
  core: ChatListConnection[];
  rowState: (conn: ChatListConnection) => InboxRowState;
  nowMs: number;
  timeZone?: string;
  actions: InboxRowActions;
  onlineUserIds: ReadonlySet<string>;
  onNewGroup: () => void;
  search: {
    query: string;
    setQuery: (q: string) => void;
    busy: boolean;
    hits: ChatSearchHit[];
  };
  onOpenSearchHit: (hit: ChatSearchHit) => void;
  /** The Hubs filter renders its own list. */
  hubs: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const query = search.query.trim().toLowerCase();
  const visible = query
    ? rows.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.chatPreview?.toLowerCase().includes(query) ||
          c.location?.toLowerCase().includes(query),
      )
    : rows;

  // `/` focuses search from anywhere in the Clicks pane that isn't already a text field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-inbox-row]') ?? []);
    const index = links.findIndex((a) => a === document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = links[Math.max(0, Math.min(links.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))];
      next?.focus();
      return;
    }
    if (index < 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    const conn = visible.find((c) => c.id === links[index].dataset.connectionId);
    if (!conn) return;
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      if (conn.chatKind !== 'group_clique') actions.toggleArchive(conn);
    } else if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      if (conn.chatId) actions.markUnread(conn);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="conversation-list">
      <div className="shrink-0 px-4 pb-3 pt-5">
        <div className="flex items-center gap-1">
          <h1 className="type-title-2 mr-auto text-fg">Clicks</h1>
          <Tooltip content="Add Click">
            <IconButton icon={ScanLine} href="/add" aria-label="Add Click" />
          </Tooltip>
          <Tooltip content="New verified group">
            <IconButton icon={Plus} variant="action" aria-label="New verified group" onClick={onNewGroup} />
          </Tooltip>
        </div>
        <SearchField
          ref={searchRef}
          className="mt-3"
          label="Search Clicks"
          placeholder="Search"
          value={search.query}
          onValueChange={search.setQuery}
        />
        <div role="group" aria-label="Filter Clicks" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              size="sm"
              selected={filter === f.id}
              onClick={() => onFilterChange(f.id)}
              count={unreadByFilter[f.id] ?? 0}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="chat-thread-scroll min-h-0 flex-1 pb-4">
        {filter === 'active' && !query && core.length > 0 ? (
          <section aria-label="Core" className="pb-2">
            <ul className="flex gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none]">
              {core.map((c) => (
                <li key={c.id} className="w-14 shrink-0">
                  <Link href={rowState(c).href} className="press flex flex-col items-center gap-1 rounded-md">
                    <Avatar
                      seed={c.otherUserId ?? c.id}
                      name={c.name}
                      src={c.avatarUrl}
                      size={48}
                      presence={Boolean(c.otherUserId && onlineUserIds.has(c.otherUserId))}
                    />
                    <span className="w-full truncate text-center text-xs font-semibold leading-4 text-fg-secondary">
                      {c.name.split(/\s+/)[0]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {filter === 'hubs' ? (
          hubs
        ) : (
          <>
            {query.length >= 2 ? (
              <section aria-label="Message results" className="px-2 pb-2">
                <p className="type-meta px-3 pb-1 pt-2 font-semibold text-fg-tertiary">
                  {search.busy ? 'Searching messages…' : `Messages · ${search.hits.length}`}
                </p>
                <ul>
                  {search.hits.slice(0, 8).map((hit) => (
                    <li key={hit.messageId}>
                      <button
                        type="button"
                        onClick={() => onOpenSearchHit(hit)}
                        className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-hover"
                      >
                        <span className="type-body-strong w-full truncate text-fg">{hit.chatName}</span>
                        <span className="type-meta line-clamp-2 text-fg-secondary">{hit.snippet}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={openCommandPalette}
                      className="type-body flex h-11 w-full items-center gap-2 rounded-md px-3 text-accent hover:bg-hover"
                    >
                      <Search size={16} aria-hidden />
                      Search everything
                      <kbd className="type-meta ml-auto text-fg-tertiary">⌘K</kbd>
                    </button>
                  </li>
                </ul>
                <p className="type-meta px-3 pb-1 pt-3 font-semibold text-fg-tertiary">People</p>
              </section>
            ) : null}

            {visible.length === 0 ? (
              !loaded ? (
                <InboxSkeleton />
              ) : query ? (
                <p className="type-body px-6 py-10 text-center text-fg-secondary">No one matches that search.</p>
              ) : (
                <EmptyState
                  icon={EMPTY[filter].icon}
                  title={EMPTY[filter].title}
                  body={EMPTY[filter].body}
                  action={
                    filter === 'active' ? (
                      <Button variant="tinted" href="/add" icon={QrCode}>
                        Show my QR
                      </Button>
                    ) : filter === 'groups' ? (
                      <Button variant="tinted" icon={Plus} onClick={onNewGroup}>
                        New verified group
                      </Button>
                    ) : null
                  }
                />
              )
            ) : (
              <ul
                ref={listRef}
                aria-label="Conversations"
                onKeyDown={onListKeyDown}
              >
                {visible.map((conn) => (
                  <InboxRow
                    key={conn.id}
                    conn={conn}
                    viewerId={viewerId}
                    state={rowState(conn)}
                    nowMs={nowMs}
                    timeZone={timeZone}
                    actions={actions}
                  />
                ))}
              </ul>
            )}

            {filter === 'groups' ? (
              <p className="type-meta flex items-center justify-center gap-1.5 px-4 pt-4 text-fg-tertiary">
                <Lock size={14} aria-hidden />
                Private chats are end-to-end encrypted.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
