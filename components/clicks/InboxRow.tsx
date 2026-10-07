'use client';

import Link from 'next/link';
import { memo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Ban,
  BellOff,
  Bell,
  CheckCheck,
  Flag,
  MailOpen,
  MoreHorizontal,
  Pencil,
  Star,
  StarOff,
  User,
  UserMinus,
  LogOut,
  Trash2,
  Users,
} from 'lucide-react';
import { Avatar, GroupAvatar } from '@/components/ds/Avatar';
import { CountBadge } from '@/components/ds/CountBadge';
import { StatusPill } from '@/components/ds/StatusPill';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/ds/Menu';
import type { ChatListConnection } from './types';
import { MUTE_OPTIONS } from '@/lib/chat/conversationApi';
import { inboxPreview, inboxTimestamp, sayHiRemaining } from '@/lib/chat/inboxFormatting';
import { UNREADABLE_PREVIEW_LABEL } from '@/lib/chat/inboxPreviews';
import { warmThreadFirstPage } from '@/lib/chat/threadPages';
import { cn } from '@/lib/cn';

export type InboxRowActions = {
  setMuted: (conn: ChatListConnection, muted: boolean, durationMs: number | null) => void;
  markUnread: (conn: ChatListConnection) => void;
  toggleCore: (conn: ChatListConnection) => void;
  viewProfile: (conn: ChatListConnection) => void;
  toggleArchive: (conn: ChatListConnection) => void;
  report: (conn: ChatListConnection) => void;
  remove: (conn: ChatListConnection) => void;
  toggleBlock: (conn: ChatListConnection) => void;
  showMembers: (conn: ChatListConnection) => void;
  renameGroup: (conn: ChatListConnection) => void;
  leaveGroup: (conn: ChatListConnection) => void;
  deleteGroup: (conn: ChatListConnection) => void;
};

export type InboxRowState = {
  href: string;
  selected: boolean;
  online: boolean;
  core: boolean;
  muted: boolean;
  archived: boolean;
  blocked: boolean;
  groupCreator: boolean;
  /** Ms deadline of the open 48-hour say-hi window, when no one has written yet. */
  sayHiDeadline: number | null;
};

/**
 * One 72 px inbox row (spec §7.2): avatar with presence, name with Core/muted marks, a
 * WhatsApp-style timestamp, the preview, and an unread badge or say-hi countdown. The "…"
 * menu (hover, focus, or right-click) carries the same actions as iOS `ConversationActions`.
 */
export const InboxRow = memo(function InboxRow({
  conn,
  viewerId,
  state,
  nowMs,
  timeZone,
  actions,
}: {
  conn: ChatListConnection;
  viewerId: string;
  state: InboxRowState;
  nowMs: number;
  timeZone?: string;
  actions: InboxRowActions;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isGroup = conn.chatKind === 'group_clique';
  // Start loading the thread's latest page on intent (50 ms hover, touch, focus), like pages.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warm = () => {
    if (!state.selected) warmThreadFirstPage(conn.chatId);
  };
  const cancelHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const unread = conn.chatUnreadCount ?? 0;
  const activityMs = conn.chatLastMessageAt ?? conn.chatUpdatedAt ?? null;
  const sayHiLeft = state.sayHiDeadline != null && !conn.chatLastMessageAt ? sayHiRemaining(state.sayHiDeadline, nowMs) : null;
  const preview = inboxPreview({
    latest: conn.chatPreview,
    sayHiOpen: sayHiLeft != null,
    location: conn.location,
    isGroup,
  });
  const unreadable = conn.chatPreview === UNREADABLE_PREVIEW_LABEL;
  const members = (conn.userIds ?? []).filter((id) => id !== viewerId).map((id) => ({ seed: id }));

  return (
    <li
      className="relative px-2 [contain-intrinsic-size:auto_72px] [content-visibility:auto]"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Link
        href={state.href}
        data-inbox-row
        data-connection-id={conn.id}
        data-testid={`conversation-row-${conn.id}`}
        aria-current={state.selected ? 'page' : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          cancelHover();
          hoverTimer.current = setTimeout(warm, 50);
        }}
        onPointerLeave={cancelHover}
        onPointerDown={warm}
        onFocus={warm}
        className={cn(
          'group flex h-[72px] items-center gap-3 rounded-md px-3 max-md:pr-10 transition-colors duration-[var(--d-fast)]',
          state.selected ? 'bg-selection' : 'hover:bg-hover',
        )}
      >
        {isGroup ? (
          <GroupAvatar seed={conn.id} name={conn.name} members={members} size={48} />
        ) : (
          <Avatar seed={conn.otherUserId ?? conn.id} name={conn.name} src={conn.avatarUrl} size={48} presence={state.online} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            <span className="type-body-strong min-w-0 truncate text-fg">{conn.name}</span>
            {state.core ? <Star size={14} aria-label="Core" className="shrink-0 fill-[var(--accent)] text-accent" /> : null}
            {state.muted ? <BellOff size={14} aria-label="Muted" className="shrink-0 text-fg-tertiary" /> : null}
            {activityMs ? (
              <span
                className={cn(
                  'type-meta tabular ml-auto shrink-0 pl-2',
                  // On desktop the row's menu takes the timestamp's place while it's in use.
                  'md:[li:hover_&]:invisible md:[li:focus-within_&]:invisible md:[li:has([data-state=open])_&]:invisible',
                  unread > 0 ? 'font-semibold text-accent' : 'text-fg-tertiary',
                )}
              >
                {inboxTimestamp(activityMs, nowMs, { timeZone })}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-start gap-2">
            <span
              className={cn(
                'type-body min-w-0 flex-1 max-md:line-clamp-2 md:truncate',
                unreadable ? 'italic text-fg-tertiary' : unread > 0 ? 'text-fg' : 'text-fg-secondary',
              )}
            >
              {preview}
            </span>
            {unread > 0 ? (
              <CountBadge count={unread} label={`${unread} unread`} className="mt-0.5" />
            ) : sayHiLeft ? (
              <StatusPill variant="tinted" className="mt-0.5 shrink-0">
                {sayHiLeft}
              </StatusPill>
            ) : null}
          </span>
        </span>
      </Link>

      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger
          aria-label={`Actions for ${conn.name}`}
          className={cn(
            'press absolute right-4 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-fg-secondary hover:bg-fill-subtle hover:text-fg',
            // Desktop: over the timestamp, on the name line.
            'md:right-3.5 md:top-2 md:translate-y-0',
            'md:opacity-0 md:focus-visible:opacity-100 md:[li:hover_&]:opacity-100 md:data-[state=open]:opacity-100',
          )}
        >
          <MoreHorizontal size={18} aria-hidden />
        </MenuTrigger>
        <MenuContent className="w-60">
          {state.muted ? (
            <MenuItem icon={Bell} onSelect={() => actions.setMuted(conn, false, null)}>
              Unmute
            </MenuItem>
          ) : (
            <MenuSub>
              <MenuSubTrigger icon={BellOff}>Mute</MenuSubTrigger>
              <MenuSubContent>
                {MUTE_OPTIONS.map((o) => (
                  <MenuItem key={o.label} onSelect={() => actions.setMuted(conn, true, o.ms)}>
                    {o.label}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
          )}
          {unread === 0 && conn.chatId ? (
            <MenuItem icon={MailOpen} onSelect={() => actions.markUnread(conn)}>
              Mark unread
            </MenuItem>
          ) : null}
          {isGroup ? (
            <>
              <MenuItem icon={Users} onSelect={() => actions.showMembers(conn)}>
                Members
              </MenuItem>
              <MenuItem icon={Pencil} onSelect={() => actions.renameGroup(conn)}>
                Edit group name
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={LogOut} destructive onSelect={() => actions.leaveGroup(conn)}>
                Leave group…
              </MenuItem>
              {state.groupCreator ? (
                <MenuItem icon={Trash2} destructive onSelect={() => actions.deleteGroup(conn)}>
                  Delete group…
                </MenuItem>
              ) : null}
            </>
          ) : (
            <>
              <MenuItem icon={state.core ? StarOff : Star} onSelect={() => actions.toggleCore(conn)}>
                {state.core ? 'Remove from Core' : 'Add to Core'}
              </MenuItem>
              <MenuItem icon={User} onSelect={() => actions.viewProfile(conn)}>
                View profile
              </MenuItem>
              <MenuItem icon={state.archived ? ArchiveRestore : Archive} onSelect={() => actions.toggleArchive(conn)}>
                {state.archived ? 'Unarchive' : 'Archive'}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={Flag} onSelect={() => actions.report(conn)}>
                Report…
              </MenuItem>
              <MenuItem icon={UserMinus} destructive onSelect={() => actions.remove(conn)}>
                Remove connection…
              </MenuItem>
              <MenuItem icon={state.blocked ? CheckCheck : Ban} destructive={!state.blocked} onSelect={() => actions.toggleBlock(conn)}>
                {state.blocked ? 'Unblock' : 'Block…'}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </li>
  );
});
